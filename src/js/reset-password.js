import { auth } from '../firebase/firebaseConfig.js';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('reset-form');
  const messageEl = document.getElementById('reset-message');
  if (!form || !messageEl) return;

  const setMessage = (text, type) => {
    messageEl.textContent = text || '';
    messageEl.style.color = type === 'error' ? '#c00' : '#007a54';
  };

  const params = new URLSearchParams(window.location.search);
  const oobCode = params.get('oobCode');

  if (!oobCode) {
    setMessage('Link de redefinição inválido ou expirado.', 'error');
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  try {
    // Valida o código antes de permitir redefinir
    await verifyPasswordResetCode(auth, oobCode);
  } catch (err) {
    console.error('Código de redefinição inválido:', err);
    setMessage('Link de redefinição inválido ou expirado.', 'error');
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = (form.elements.namedItem('password')?.value || '').trim();
    const confirm = (form.elements.namedItem('confirm')?.value || '').trim();

    if (!password || !confirm) {
      setMessage('Preencha todos os campos.', 'error');
      return;
    }
    if (password !== confirm) {
      setMessage('As senhas não coincidem.', 'error');
      return;
    }

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setMessage('Senha redefinida com sucesso! Você já pode entrar.', 'success');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1500);
    } catch (err) {
      console.error('Erro ao redefinir senha:', err);
      setMessage('Não foi possível redefinir sua senha. Tente novamente ou solicite um novo link.', 'error');
    }
  });
});
