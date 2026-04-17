import { auth } from '../firebase/firebaseConfig.js';
import { signInWithEmailAndPassword } from 'firebase/auth';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.login-form');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const redirect = String(params.get('redirect') || '').trim().toLowerCase();
  const redirectTarget = redirect === 'checkout' ? '/checkout' : '/';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('input[type="text"]').value.trim();
    const password = form.querySelector('input[type="password"]').value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = redirectTarget;
    } catch (err) {
      alert('Erro ao fazer login: ' + (err.message || 'Verifique seu e-mail e senha.'));
    }
  });
});
