import { auth } from '../firebase/firebaseConfig.js';
import { sendPasswordResetEmail } from 'firebase/auth';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgot-form');
  const messageEl = document.getElementById('forgot-message');
  if (!form) return;

  const setMessage = (text, type) => {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.style.color = type === 'error' ? '#c00' : '#007a54';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (form.elements.namedItem('email')?.value || '').trim();
    if (!email) {
      setMessage('Não foi possível enviar o email de recuperação.', 'error');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.', 'success');
    } catch {
      setMessage('Não foi possível enviar o email de recuperação.', 'error');
    }
  });
});
