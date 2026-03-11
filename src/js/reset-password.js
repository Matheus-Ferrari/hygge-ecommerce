import { auth } from '../firebase/firebaseConfig.js';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';

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

  const passwordInput = form.elements.namedItem('password');
  if (passwordInput && passwordInput instanceof HTMLInputElement) {
    passwordInput.addEventListener('input', () => {
      const val = passwordInput.value || '';
      if (!val) {
        setMessage('', 'success');
        return;
      }

      const strength = avaliarForcaSenha(val);
      if (strength.ok) {
        setMessage('Senha forte.', 'success');
      } else {
        setMessage(strength.message, 'error');
      }
    });
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

    const strength = avaliarForcaSenha(password);
    if (!strength.ok) {
      setMessage(strength.message, 'error');
      (form.elements.namedItem('password') instanceof HTMLElement ? form.elements.namedItem('password') : null)?.focus?.();
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
