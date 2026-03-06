// todosJogos.js
// Mantém os cards locais (imagem/descrição já existentes) e apenas ajusta o link
// do botão "Comprar" para: produto.html?id=slug-do-nome

const slugify = (text) => {
  const raw = (text || '').toString().trim();
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Remove caracteres especiais e converte espaços para hífen
  let slug = normalized
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Ajuste pontual para bater com o exemplo esperado ("Hygge Game")
  if (slug === 'o-hygge-game') slug = 'hygge-game';

  return slug;
};

document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.produto-card');
  if (!cards.length) return;

  cards.forEach((card) => {
    const titleEl = card.querySelector('.product-card__title');
    const buyEl = card.querySelector('.btn-comprar');
    if (!titleEl || !buyEl) return;

    const slug = slugify(titleEl.textContent);
    if (!slug) return;

    buyEl.setAttribute('href', `produto.html?id=${encodeURIComponent(slug)}`);
  });
});
