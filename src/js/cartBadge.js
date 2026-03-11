// cartBadge.js - Atualiza o contador de itens no ícone do carrinho (header)
(function () {
  const CART_KEY = 'cart';

  function safeParse(raw) {
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getCartCount() {
    const items = safeParse(localStorage.getItem(CART_KEY));
    return items.reduce((acc, item) => {
      const qty = Math.max(0, Math.floor(Number(item?.quantidade || 0)));
      return acc + qty;
    }, 0);
  }

  function updateBadges() {
    const count = getCartCount();
    const buttons = document.querySelectorAll('.cart-btn');
    buttons.forEach((btn) => {
      btn.setAttribute('data-count', String(count));
      btn.setAttribute('aria-label', count > 0 ? `Carrinho com ${count} item(ns)` : 'Carrinho');
    });
  }

  document.addEventListener('DOMContentLoaded', updateBadges);

  // Atualiza ao voltar pra aba (caso o carrinho tenha mudado em outra página)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateBadges();
  });

  // Atualiza quando outra aba mexe no storage
  window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) updateBadges();
  });

  // Evento customizado disparado por scripts do próprio site
  document.addEventListener('cart:updated', updateBadges);

  // Expor helper leve para depuração/uso interno
  window.__updateCartBadge = updateBadges;
})();
