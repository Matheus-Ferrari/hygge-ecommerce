import { getProducts } from '../firebase/productService.js';
import { getFirebaseUrl } from './script.js';

const IMAGE_PLACEHOLDER = 'src/img/logo.png';

const slugify = (text) => {
  const raw = (text || '').toString().trim();
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let slug = normalized
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug === 'o-hygge-game') slug = 'hygge-game';
  return slug;
};

document.addEventListener('DOMContentLoaded', async () => {
  const cards = document.querySelectorAll('.produto-card');
  if (!cards.length) return;

  let products = [];
  try {
    products = await getProducts();
  } catch {
    products = [];
  }

  try {
    const bySlug = new Map();
    products.forEach((produto) => {
      const slug = slugify(produto?.nome);
      if (!slug) return;
      bySlug.set(slug, produto || {});
    });

    for (const card of cards) {
      const titleEl = card.querySelector('.product-card__title');
      const buyEl = card.querySelector('.btn-comprar');
      const imgLinkEl = card.querySelector('.produto-img-link');
      const imgEl = card.querySelector('img.produto-img');
      if (!titleEl) continue;

      const slug = slugify(titleEl.textContent);
      if (!slug) continue;

      const href = `/produto?id=${encodeURIComponent(slug)}`;
      if (buyEl) buyEl.setAttribute('href', href);
      if (imgLinkEl) imgLinkEl.setAttribute('href', href);

      const produto = bySlug.get(slug) || {};
      const galeria = Array.isArray(produto?.galeria) ? produto.galeria : [];
      const rawPath = produto?.imagemCapa || galeria[0] || '';
      const capa = await getFirebaseUrl(rawPath);

      if (imgEl instanceof HTMLImageElement) {
        imgEl.src = capa || IMAGE_PLACEHOLDER;
        imgEl.onerror = () => {
          imgEl.onerror = null;
          imgEl.src = IMAGE_PLACEHOLDER;
          imgEl.style.objectFit = 'contain';
        };
      }
    }
  } catch (error) {
    console.error('Falha ao mapear produtos em todosJogos.js:', error);
  }
});
