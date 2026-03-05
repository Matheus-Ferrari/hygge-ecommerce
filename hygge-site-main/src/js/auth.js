import { auth, db } from '../firebase/firebaseConfig.js';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const errorDiv = document.getElementById('register-error');
  const successDiv = document.getElementById('register-success');
  if (!form) return;
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
        await addDoc(collection(db, 'mail'), {
          to: email,
          message: {
            subject: 'Bem-vindo(a) à Hygge Games!',
            html: `
              <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <h2 style="color: #FF7A00;">Olá, ${name || 'cliente'}!</h2>
                <p>Que alegria ter você na <strong>Hygge Games</strong>.</p>
                <p>Sua conta foi criada com sucesso! Agora você já pode aproveitar nossos jogos de tabuleiro para se conectar de verdade com quem você ama.</p>
                <br>
                <p>Um abraço caloroso,<br><strong>Equipe Hygge Games</strong></p>
              </div>
            `,
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
      if (errorDiv) errorDiv.textContent = error?.message || 'Erro ao criar conta. Tente novamente.';
    }
  });
});
