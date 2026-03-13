import { getProducts } from '../firebase/productService.js';
import { getFirebaseUrl } from './script.js';

const IMAGE_PLACEHOLDER = 'src/img/logo.png';
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

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

function setImage(img, src) {
  if (!(img instanceof HTMLImageElement)) return;
  img.src = src || TRANSPARENT_PIXEL;
  img.onerror = () => {
    img.onerror = null;
    img.src = IMAGE_PLACEHOLDER;
    img.style.objectFit = 'contain';
  };
}

async function renderHomeProducts() {
  try {
    const cards = document.querySelectorAll('.produto-card');
    if (!cards.length) return;

    const products = await getProducts();
    const map = new Map();

    (Array.isArray(products) ? products : []).forEach((produto) => {
      const slug = slugify(produto?.nome);
      if (!slug) return;
      map.set(slug, produto || {});
    });

    await Promise.all(Array.from(cards).map(async (card) => {
      const titleEl = card.querySelector('.product-card__title');
      const imgEl = card.querySelector('img.produto-img');
      if (!titleEl || !(imgEl instanceof HTMLImageElement)) return;

      const slug = slugify(titleEl.textContent);
      const produto = map.get(slug) || {};
      const galeria = Array.isArray(produto?.galeria) ? produto.galeria : [];
      const rawPath = produto?.imagemCapa || galeria[0] || '';
      const capa = await getFirebaseUrl(rawPath);
      setImage(imgEl, capa);
    }));
  } catch (error) {
    console.error('Falha ao renderizar cards da home:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderHomeProducts();
});
