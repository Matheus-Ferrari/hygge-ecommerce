import { auth, db } from '../firebase/firebaseConfig.js';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { generateEmailTemplate } from '../firebase/emailTemplates.js';

const PASSWORD_MIN_LENGTH = 6;

function avaliarForcaSenha(password) {
  const senha = String(password || '');
  const issues = [];

  if (senha.length < PASSWORD_MIN_LENGTH) issues.push(`mínimo de ${PASSWORD_MIN_LENGTH} caracteres`);
  if (!/[a-z]/.test(senha)) issues.push('1 letra minúscula');
  if (!/[A-Z]/.test(senha)) issues.push('1 letra maiúscula');
  if (!/\d/.test(senha)) issues.push('1 número');
  if (!/[^A-Za-z0-9]/.test(senha)) issues.push('1 símbolo');

  return {
    ok: issues.length === 0,
    issues,
    message:
      issues.length === 0
        ? 'Senha forte.'
        : `Senha fraca. Use: ${issues.join(', ')}.`,
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const errorDiv = document.getElementById('register-error');
  const successDiv = document.getElementById('register-success');
  if (!form) return;

  const passwordInput = form.elements.namedItem('password');
  const checklist = document.getElementById('password-checklist');

  function updateChecklist(val) {
    if (!checklist) return;
    checklist.hidden = !val;
    const rules = {
      length: val.length >= PASSWORD_MIN_LENGTH,
      lower:  /[a-z]/.test(val),
      upper:  /[A-Z]/.test(val),
      number: /\d/.test(val),
      symbol: /[^A-Za-z0-9]/.test(val),
    };
    checklist.querySelectorAll('li[data-rule]').forEach((li) => {
      const rule = li.dataset.rule;
      li.classList.toggle('ok', Boolean(rules[rule]));
    });
  }

  if (passwordInput && passwordInput instanceof HTMLInputElement) {
    passwordInput.addEventListener('input', () => {
      const val = passwordInput.value || '';
      updateChecklist(val);
      // Clear submit-level strength error while user is typing
      if (errorDiv && errorDiv.dataset.source === 'password-strength') {
        errorDiv.textContent = '';
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorDiv) errorDiv.textContent = '';
    if (successDiv) successDiv.textContent = '';

    const name = (form.elements.namedItem('name')?.value || '').trim();
    const email = (form.elements.namedItem('email')?.value || '').trim();
    const password = form.elements.namedItem('password')?.value || '';
    const confirm = form.elements.namedItem('confirm')?.value || '';

    if (!name || !email || !password || !confirm) {
      if (errorDiv) errorDiv.textContent = 'Preencha todos os campos.';
      return;
    }
    if (password !== confirm) {
      if (errorDiv) errorDiv.textContent = 'As senhas não coincidem.';
      return;
    }

    const strength = avaliarForcaSenha(password);
    if (!strength.ok) {
      if (errorDiv) {
        errorDiv.dataset.source = 'password-strength';
        errorDiv.textContent = 'Sua senha não atende todos os requisitos abaixo.';
      }
      // Show checklist and shake it so the user sees what's missing
      if (checklist) {
        checklist.hidden = false;
        updateChecklist(password);
        checklist.classList.remove('checklist-shake');
        // Force reflow so the animation restarts
        void checklist.offsetWidth;
        checklist.classList.add('checklist-shake');
      }
      passwordInput instanceof HTMLElement && passwordInput.focus?.();
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Opcional: definir displayName
      try {
        await updateProfile(cred.user, { displayName: name });
      } catch {
        // Não bloqueia o fluxo caso falhe.
      }

      // Opcional: criar/atualizar doc do usuário no Firestore
      try {
        await setDoc(
          doc(db, 'users', cred.user.uid),
          {
            nome: name,
            email,
            data_cadastro: serverTimestamp(),
            perfil_ativo: true,
          },
          { merge: true }
        );
      } catch (firestoreError) {
        console.error('Erro ao salvar dados básicos do usuário:', firestoreError);
        // Firestore pode estar bloqueado por regras; não bloqueia o cadastro.
      }

      // Cria documento na coleção "mail" para disparo do e-mail de boas-vindas
      try {
        const storeLink = 'https://e-commerce-hygge.firebaseapp.com/index.html';
        await addDoc(collection(db, 'mail'), {
          to: email,
          message: {
            subject: 'Bem-vindo(a) à Hygge Games!',
            html: generateEmailTemplate({
              title: 'Bem-vindo à Hygge Games',
              message: `Olá, ${name || 'cliente'}!\n\nQue alegria ter você aqui. Sua conta foi criada com sucesso — agora você já pode aproveitar nossos jogos para se conectar de verdade com quem você ama.`,
              buttonText: 'Visitar a loja',
              buttonLink: storeLink,
              footerText: 'Hygge Games • Jogos para se conectar de verdade.',
            }),
          },
        });
      } catch (mailError) {
        console.error('Erro ao enfileirar e-mail de boas-vindas:', mailError);
        // Falha no envio de e-mail não deve impedir o cadastro.
      }

      if (successDiv) successDiv.textContent = 'Conta criada com sucesso!';
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 700);
    } catch (error) {
      console.error('Erro ao criar usuário no Firebase Auth:', error);
      if (errorDiv) {
        const code = String(error?.code || '');
        if (code === 'auth/weak-password') {
          const strengthMsg = avaliarForcaSenha(password).message;
          errorDiv.textContent = strengthMsg || 'Senha fraca. Use uma senha mais forte.';
        } else {
          errorDiv.textContent = error?.message || 'Erro ao criar conta. Tente novamente.';
        }
      }
    }
  });
});
