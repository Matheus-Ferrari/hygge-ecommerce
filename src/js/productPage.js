import { getProducts } from '../firebase/productService.js';

// Specs padrão compartilhados por todos os jogos Hygge
// Usados como fallback quando o campo não existe no Firestore
const DEFAULT_GAME_SPECS = {
  Idade: '14+ anos',
  Jogadores: '2+',
  'Duração': '20–30 minutos',
};

const DEFAULT_TECH_SPECS = {
  'Quantidade de cartas': '110',
  'Peso': '340 g',
  'Largura': '145 mm',
  'Comprimento': '145 mm',
  'Altura': '55 mm',
  'NCM': '4819.20.00',
};

// Overrides por slug para specs de jogo que diferem do padrão
const GAME_SPECS_OVERRIDES = {
  'quem-na-roda': { Idade: '17+ anos', Jogadores: '3+', 'Duração': '20–30 minutos' },
};

const BASE_PRICE = 119;
const IMAGE_PLACEHOLDER = 'src/img/logo.png';

const formatPrice = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getSlugFromUrl = () => new URLSearchParams(window.location.search).get('id');

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

const safeText = (value) => (value == null ? '' : String(value));

const setMessage = (text) => {
  const el = document.getElementById('product-message');
  if (el) el.textContent = text || '';
};

const stripEspecificacoesFromText = (value) => {
  let text = safeText(value);
  if (!text) return '';
  return text.replace(/\s*especifica(?:ç|c)(?:o|õ)es\s*:\s*[\s\S]*$/i, '').trim();
};

const normalizeDescricaoCompleta = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripEspecificacoesFromText(item).trim())
      .filter(Boolean);
  }

  const text = stripEspecificacoesFromText(safeText(value)).trim();
  if (!text) return [];

  const parts = text
    .split(/\n\s*\n/g)
    .map((item) => item.replace(/\n+/g, ' ').trim())
    .filter(Boolean);

  return parts.length ? parts : [text];
};

const resolveStorageUrl = (path) => {
  const raw = safeText(path).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith('gs://')) return '';

  const withoutScheme = raw.slice('gs://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex === -1) return '';

  const bucket = withoutScheme.slice(0, slashIndex);
  const filePath = withoutScheme.slice(slashIndex + 1);
  if (!bucket || !filePath) return '';

  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
};

const resolveGalleryUrls = (list) => {
  if (!Array.isArray(list)) return [];
  const unique = [];

  list.forEach((path) => {
    const url = resolveStorageUrl(path);
    if (!url || unique.includes(url)) return;
    unique.push(url);
  });

  return unique;
};

const getQty = () => {
  const el = document.getElementById('quantity');
  return Math.max(1, Math.floor(Number(el?.textContent?.trim() || 1)));
};

const setQty = (val) => {
  const el = document.getElementById('quantity');
  if (!el) return;
  const max = Number(el.dataset.max || 99);
  const min = Number(el.dataset.min || 1);
  el.textContent = String(Math.max(min, Math.min(max, val)));
  updateTotalPrice();
};

const updateTotalPrice = () => {
  const qtyEl = document.getElementById('quantity');
  const priceEl = document.getElementById('product-price');
  if (!qtyEl || !priceEl) return;

  const qty = Math.max(1, Math.floor(Number(qtyEl.textContent || 1)));
  priceEl.textContent = formatPrice(BASE_PRICE * qty);
};

const readCart = () => {
  try {
    const raw = localStorage.getItem('cart');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeCart = (cart) => {
  localStorage.setItem('cart', JSON.stringify(cart));
  document.dispatchEvent(new CustomEvent('cart:updated'));
};

const addToCart = (product, quantity) => {
  const cart = readCart();
  const qtyToAdd = Math.max(1, Math.floor(Number(quantity || 1)));
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    existing.quantidade = Number(existing.quantidade || 0) + qtyToAdd;
    existing.imagem = safeText(product.imagemCapa).trim() || IMAGE_PLACEHOLDER;
  } else {
    cart.push({
      id: product.id,
      nome: product.nome,
      preco: BASE_PRICE,
      quantidade: qtyToAdd,
      imagem: safeText(product.imagemCapa).trim() || IMAGE_PLACEHOLDER,
    });
  }

  writeCart(cart);
};

const renderProduct = (product) => {
  const imageEl = document.getElementById('mainProductImage') || document.getElementById('product-image');
  const thumbnailsEl = document.getElementById('product-thumbnails');
  const nameEl = document.getElementById('product-name');
  const priceEl = document.getElementById('product-price');
  const shortDescEl = document.getElementById('product-short-description');
  const categoryEl = document.getElementById('product-category');
  const stockEl = document.getElementById('product-stock');
  const qtyEl = document.getElementById('quantity');
  const fullDescEl = document.getElementById('product-full-description');
  const toggleFullDescBtn = document.getElementById('toggle-full-description');
  const gameSpecsEl = document.getElementById('game-specs');
  const techSpecsEl = document.getElementById('product-tech-specs');

  const gallery = product.imagens.length ? product.imagens : [product.imagemCapa || IMAGE_PLACEHOLDER];

  if (imageEl) {
    imageEl.src = gallery[0] || IMAGE_PLACEHOLDER;
    imageEl.alt = safeText(product.nome);
    imageEl.onerror = () => {
      imageEl.onerror = null;
      imageEl.src = IMAGE_PLACEHOLDER;
      imageEl.style.objectFit = 'contain';
    };
  }

  if (thumbnailsEl) {
    thumbnailsEl.innerHTML = '';

    const setActive = (activeSrc) => {
      const thumbs = thumbnailsEl.querySelectorAll('img.thumbnail');
      thumbs.forEach((thumb) => {
        thumb.classList.toggle('is-active', thumb.getAttribute('data-src') === activeSrc);
      });
    };

    gallery.forEach((src, index) => {
      const thumb = document.createElement('img');
      thumb.className = `thumbnail${index === 0 ? ' is-active' : ''}`;
      thumb.src = src || IMAGE_PLACEHOLDER;
      thumb.alt = `Imagem ${index + 1} de ${safeText(product.nome)}`;
      thumb.loading = 'lazy';
      thumb.setAttribute('data-src', src || IMAGE_PLACEHOLDER);
      thumb.onerror = () => {
        thumb.onerror = null;
        thumb.src = IMAGE_PLACEHOLDER;
      };

      thumb.addEventListener('click', () => {
        if (!imageEl) return;
        imageEl.src = src || IMAGE_PLACEHOLDER;
        setActive(src || IMAGE_PLACEHOLDER);
      });

      thumbnailsEl.appendChild(thumb);
    });
  }

  if (nameEl) nameEl.textContent = safeText(product.nome);
  if (shortDescEl) shortDescEl.textContent = stripEspecificacoesFromText(product.descricaoCurta || product.descricao);
  if (categoryEl) categoryEl.textContent = safeText(product.categoria || '—');
  if (stockEl) stockEl.textContent = 'Disponível';

  if (qtyEl) {
    qtyEl.textContent = '1';
    qtyEl.dataset.min = '1';
    qtyEl.dataset.max = '99';
  }

  if (priceEl) priceEl.textContent = formatPrice(BASE_PRICE);

  if (fullDescEl) {
    fullDescEl.innerHTML = '';
    const parts = normalizeDescricaoCompleta(product.descricaoCompleta);

    if (!parts.length) {
      const section = fullDescEl.closest('.product-section');
      if (section) section.style.display = 'none';
      if (toggleFullDescBtn) {
        toggleFullDescBtn.hidden = true;
        toggleFullDescBtn.setAttribute('aria-expanded', 'false');
      }
    } else {
      const section = fullDescEl.closest('.product-section');
      if (section) section.style.display = '';

      parts.forEach((text) => {
        const p = document.createElement('p');
        p.textContent = text;
        fullDescEl.appendChild(p);
      });

      if (toggleFullDescBtn) {
        toggleFullDescBtn.onclick = null;
        toggleFullDescBtn.hidden = true;
        toggleFullDescBtn.textContent = 'Ver mais';
        toggleFullDescBtn.setAttribute('aria-expanded', 'false');

        const COLLAPSED_HEIGHT = 220;
        fullDescEl.classList.add('is-collapsed');
        fullDescEl.style.maxHeight = `${COLLAPSED_HEIGHT}px`;
        fullDescEl.style.overflow = 'hidden';

        requestAnimationFrame(() => {
          const expandedHeight = fullDescEl.scrollHeight;
          if (expandedHeight <= COLLAPSED_HEIGHT + 1) {
            fullDescEl.classList.remove('is-collapsed');
            fullDescEl.style.maxHeight = '';
            fullDescEl.style.overflow = '';
            toggleFullDescBtn.hidden = true;
            return;
          }

          toggleFullDescBtn.hidden = false;
          let expanded = false;
          toggleFullDescBtn.onclick = () => {
            expanded = !expanded;
            toggleFullDescBtn.setAttribute('aria-expanded', String(expanded));
            toggleFullDescBtn.textContent = expanded ? 'Ver menos' : 'Ver mais';

            if (expanded) {
              fullDescEl.classList.remove('is-collapsed');
              fullDescEl.style.maxHeight = `${expandedHeight}px`;
              fullDescEl.style.overflow = 'visible';
            } else {
              fullDescEl.classList.add('is-collapsed');
              fullDescEl.style.maxHeight = `${COLLAPSED_HEIGHT}px`;
              fullDescEl.style.overflow = 'hidden';
            }
          };
        });
      }
    }
  }

  const renderSpecs = (container, specs) => {
    if (!container) return;
    container.innerHTML = '';

    const entries = specs && typeof specs === 'object' ? Object.entries(specs) : [];
    const section = container.closest('.product-section');

    if (!entries.length) {
      if (section) section.style.display = 'none';
      return;
    }

    if (section) section.style.display = '';

    entries.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'product-spec__row';
      const left = document.createElement('span');
      const right = document.createElement('strong');
      left.textContent = label;
      right.textContent = safeText(value);
      row.appendChild(left);
      row.appendChild(right);
      container.appendChild(row);
    });
  };

  renderSpecs(gameSpecsEl, product.especificacoesJogo);
  renderSpecs(techSpecsEl, product.especificacoesTecnicas);
};

const findFirebaseProductBySlug = async (slug) => {
  const products = await getProducts();
  return products.find((item) => slugify(item?.nome) === slug) || null;
};

const init = async () => {
  setMessage('');

  const slug = getSlugFromUrl();
  if (!slug) {
    setMessage('Produto não encontrado.');
    return;
  }

  setMessage('Carregando produto...');

  let fromFirebase = null;
  try {
    fromFirebase = await findFirebaseProductBySlug(slug);
  } catch {
    fromFirebase = null;
  }

  if (!fromFirebase) {
    setMessage('Produto não encontrado.');
    return;
  }

  const imagemCapa = resolveStorageUrl(fromFirebase?.imagemCapa);
  const imagens = resolveGalleryUrls(fromFirebase?.galeria);

  const product = {
    id: slug,
    nome: safeText(fromFirebase.nome),
    descricao: safeText(fromFirebase.descricao),
    descricaoCurta: safeText(fromFirebase.descricaoCurta),
    descricaoCompleta: fromFirebase.descricaoCompleta,
    especificacoesJogo: fromFirebase.especificacoesJogo || GAME_SPECS_OVERRIDES[slug] || DEFAULT_GAME_SPECS,
    especificacoesTecnicas: fromFirebase.especificacoesTecnicas || DEFAULT_TECH_SPECS,
    categoria: fromFirebase.categoria,
    imagemCapa: imagemCapa || IMAGE_PLACEHOLDER,
    imagens,
  };

  renderProduct(product);
  updateTotalPrice();
  setMessage('');

  const addBtn = document.getElementById('add-to-cart-btn');
  const buyNowBtn = document.getElementById('buy-now-btn');

  const handleBuy = () => {
    const quantity = getQty();
    if (!Number.isFinite(quantity) || quantity < 1) {
      setMessage('Quantidade inválida.');
      return;
    }

    addToCart(product, quantity);
    setMessage('Produto adicionado ao carrinho.');
  };

  if (addBtn) addBtn.addEventListener('click', handleBuy);

  if (buyNowBtn) {
    buyNowBtn.addEventListener('click', () => {
      const quantity = getQty();
      if (!Number.isFinite(quantity) || quantity < 1) {
        setMessage('Quantidade inválida.');
        return;
      }

      addToCart(product, quantity);
      window.location.href = '/checkout';
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const minusBtn = document.getElementById('qty-minus');
  const plusBtn = document.getElementById('qty-plus');

  if (minusBtn) minusBtn.addEventListener('click', () => setQty(getQty() - 1));
  if (plusBtn) plusBtn.addEventListener('click', () => setQty(getQty() + 1));

  init();
});
