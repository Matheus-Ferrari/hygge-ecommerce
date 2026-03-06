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
      const response = await fetch('https://us-central1-e-commerce-hygge.cloudfunctions.net/solicitarRedefinicaoSenha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('HTTP error');
      }

      setMessage('Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.', 'success');
    } catch (err) {
      console.error('Erro ao solicitar redefinição de senha:', err);
      setMessage('Não foi possível enviar o email de recuperação.', 'error');
    }
  });
});
