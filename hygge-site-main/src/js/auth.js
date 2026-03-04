import { auth, db } from '../firebase/firebaseConfig.js';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

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
      } catch {
        // Firestore pode estar bloqueado por regras; não bloqueia o cadastro.
      }

      if (successDiv) successDiv.textContent = 'Conta criada com sucesso!';
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 700);
    } catch (error) {
      if (errorDiv) errorDiv.textContent = error?.message || 'Erro ao criar conta. Tente novamente.';
    }
  });
});
