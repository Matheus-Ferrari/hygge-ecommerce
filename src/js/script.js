import { doc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/firebaseConfig.js';
import './metaPixel.js'; // Meta Pixel — PageView automático em todas as páginas

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const ASSET_CACHE_KEY = 'hygge_assets_v1';
const LQIP_CACHE_KEY  = 'hygge_lqip_v1';
const ASSET_CACHE_TS  = 'hygge_assets_ts';
const CACHE_TTL_MS    = 20 * 60 * 1000; // 20 minutos

// Gera um thumbnail minúsculo (base64 JPEG ~40px) para blur-up
async function generateLqip(url) {
  if (!url || url === TRANSPARENT_PIXEL) return null;
  try {
    const src = new Image();
    src.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { src.onload = res; src.onerror = rej; src.src = url; });
    const W = 40;
    const H = Math.max(1, Math.round(W * src.naturalHeight / (src.naturalWidth || W)));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.getContext('2d').drawImage(src, 0, 0, W, H);
    return canvas.toDataURL('image/jpeg', 0.4);
  } catch (e) { return null; }
}

// Aplica blur-up: mostra lqip borrado imediatamente,
// quando a imagem full carrega faz crossfade removendo o blur
function applyBannerBlurUp(img, fullUrl, lqipUrl) {
  if (!(img instanceof HTMLImageElement) || !fullUrl) return;
  if (lqipUrl) {
    img.style.transition = 'none';
    img.style.filter     = 'blur(12px)';
    img.style.transform  = 'scale(1.05)';
    img.src = lqipUrl;
    const full = new Image();
    full.onload = () => {
      img.style.transition = 'filter 0.5s ease, transform 0.5s ease';
      img.src              = fullUrl;
      img.style.filter     = '';
      img.style.transform  = '';
    };
    full.src = fullUrl;
  } else {
    applyImageSrc(img, fullUrl);
  }
}

export async function getFirebaseUrl(path) {
  if (!path) return TRANSPARENT_PIXEL;
  const raw = String(path).trim();
  if (!raw) return TRANSPARENT_PIXEL;
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('gs://')) {
    try {
      return await getDownloadURL(ref(storage, raw));
    } catch (error) {
      console.error('[Assets] Erro ao buscar token da imagem:', raw, error);
      return TRANSPARENT_PIXEL;
    }
  }
  return raw;
}

function applyImageSrc(img, src) {
  if (!(img instanceof HTMLImageElement)) return;
  img.src = src || TRANSPARENT_PIXEL;
  img.onerror = () => {
    img.onerror = null;
    img.removeAttribute('src');
    img.style.display = 'none';
  };
}

function extractPath(value, isMobile) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const candidates = isMobile
    ? [value.mobile, value.mobileUrl, value.mobilePath, value.urlMobile, value.desktop, value.desktopUrl, value.url, value.path, value.src]
    : [value.desktop, value.desktopUrl, value.desktopPath, value.url, value.path, value.src, value.mobile, value.mobileUrl];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function getField(data, key, aliases = []) {
  if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(data, alias)) return data[alias];
  }
  return undefined;
}

// URL do logo resolvida — preenchida assim que os assets carregam
let _resolvedLogoUrl = '';

function applyLogoToAll(url) {
  if (!url) return;
  document.querySelectorAll('.logo-img, img[alt="Logo Hygge Games"]').forEach((img) =>
    applyImageSrc(img, url)
  );
}

// Observa novos elementos (ex: rodapé carregado via fetch) e aplica o logo
function startLogoObserver() {
  if (!('MutationObserver' in window)) return;
  const obs = new MutationObserver((mutations) => {
    if (!_resolvedLogoUrl) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        node.querySelectorAll('.logo-img, img[alt="Logo Hygge Games"]').forEach((img) =>
          applyImageSrc(img, _resolvedLogoUrl)
        );
        if (node.matches('.logo-img, img[alt="Logo Hygge Games"]')) {
          applyImageSrc(node, _resolvedLogoUrl);
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function applyAssetsToDOM(resolved, isMobile, lqip = {}) {
  const bannerHome    = isMobile ? (resolved.bannerHomeMobile    || resolved.bannerHome)    : (resolved.bannerHome    || resolved.bannerHomeMobile);
  const bannerContato = isMobile ? (resolved.bannerContatoMobile || resolved.bannerContato) : (resolved.bannerContato || resolved.bannerContatoMobile);
  const bannerLogin   = isMobile ? (resolved.bannerLoginMobile   || resolved.bannerLogin)   : (resolved.bannerLogin   || resolved.bannerLoginMobile);
  const bannerSobre   = isMobile ? (resolved.bannerSobreHyggeMobile || resolved.bannerSobreHygge) : (resolved.bannerSobreHygge || resolved.bannerSobreHyggeMobile);
  const bannerProdutos = isMobile ? (bannerHome || resolved.bannerProdutos) : (resolved.bannerProdutos || bannerHome);

  _resolvedLogoUrl = resolved.logo || '';
  applyLogoToAll(_resolvedLogoUrl);
  applyBannerBlurUp(document.getElementById('banner-home'),     bannerHome,    lqip.bannerHome);
  applyBannerBlurUp(document.getElementById('banner-contato'),  bannerContato, lqip.bannerContato);
  applyBannerBlurUp(document.getElementById('banner-login'),    bannerLogin,   lqip.bannerLogin);
  applyBannerBlurUp(document.getElementById('banner-produtos'), bannerProdutos, lqip.bannerProdutos);
  applyBannerBlurUp(document.getElementById('banner-sobre'),    bannerSobre,   lqip.bannerSobre);
  applyImageSrc(document.getElementById('icone-sobre1'), resolved.pngsobrehygge1);
  applyImageSrc(document.getElementById('icone-sustentabilidade'), resolved.pngsobrehygge2);
  applyImageSrc(document.getElementById('icone-producao'), resolved.pngsobrehygge3);
}

function applyCachedAssets() {
  try {
    const cached = JSON.parse(localStorage.getItem(ASSET_CACHE_KEY) || 'null');
    if (!cached) return;
    const lqip = JSON.parse(localStorage.getItem(LQIP_CACHE_KEY) || '{}');
    applyAssetsToDOM(cached, window.innerWidth <= 768, lqip);
    // Cache existe: esconde o preloader assim que os assets forem aplicados
    if (typeof window.__hyggeHidePreloader === 'function') window.__hyggeHidePreloader();
  } catch (e) { /* ignore */ }
}

function applyHeaderScrollState() {
  const header = document.querySelector('.header');
  if (!header) return;
  if (document.body.classList.contains('page-carrinho') || document.body.classList.contains('page-checkout')) {
    header.classList.add('solid');
    return;
  }
  header.classList.toggle('solid', window.scrollY > 10);
}

export async function loadAppAssets() {
  try {
    // Se o cache foi atualizado há menos de 20 min, não re-busca no Firebase
    const cacheAge = Date.now() - parseInt(localStorage.getItem(ASSET_CACHE_TS) || '0', 10);
    if (cacheAge < CACHE_TTL_MS && localStorage.getItem(ASSET_CACHE_KEY)) return;

    const snap = await getDoc(doc(db, 'configuracoes', 'aparencia'));
    if (!snap.exists()) {
      console.warn('[Assets] Documento configuracoes/aparencia não encontrado no Firestore.');
      return;
    }

    const dados = snap.data() || {};
    const isMobile = window.innerWidth <= 768;

    const FIELDS = [
      { key: 'logo',                   aliases: ['logoUrl', 'logo_url'] },
      { key: 'bannerHome',             aliases: ['banner_home'] },
      { key: 'bannerHomeMobile',       aliases: ['banner_home_mobile'] },
      { key: 'bannerContato',          aliases: ['banner_contato'] },
      { key: 'bannerContatoMobile',    aliases: ['banner_contato_mobile'] },
      { key: 'bannerLogin',            aliases: ['banner_login'] },
      { key: 'bannerLoginMobile',      aliases: ['banner_login_mobile'] },
      { key: 'bannerProdutos',         aliases: ['banner_produtos'] },
      { key: 'bannerSobreHygge',       aliases: ['bannerSobre', 'banner_sobre_hygge'] },
      { key: 'bannerSobreHyggeMobile', aliases: ['bannerSobreMobile', 'banner_sobre_hygge_mobile'] },
      { key: 'pngsobrehygge1',         aliases: ['png_sobre_hygge1'] },
      { key: 'pngsobrehygge2',         aliases: ['png_sobre_hygge2'] },
      { key: 'pngsobrehygge3',         aliases: ['png_sobre_hygge3'] },
    ];

    // Resolve todas as URLs em paralelo via getFirebaseUrl (getDownloadURL para gs://)
    const resolved = {};
    await Promise.all(
      FIELDS.map(async ({ key, aliases }) => {
        const raw = getField(dados, key, aliases);
        const path = extractPath(raw, isMobile);
        resolved[key] = path ? await getFirebaseUrl(path) : '';
      })
    );

    // Salva no cache para aplicar instantaneamente na próxima visita
    try { localStorage.setItem(ASSET_CACHE_KEY, JSON.stringify(resolved)); } catch (e) { /* ignore */ }
    try { localStorage.setItem(ASSET_CACHE_TS, String(Date.now())); } catch (e) { /* ignore */ }

    applyAssetsToDOM(resolved, isMobile);
    // Esconde o preloader após aplicar os assets (novo usuário sem cache)
    if (typeof window.__hyggeHidePreloader === 'function') window.__hyggeHidePreloader();

    // Gera thumbnails LQIP em background para o blur-up na próxima visita
    const lqipTargets = {
      bannerHome:    isMobile ? (resolved.bannerHomeMobile    || resolved.bannerHome)    : (resolved.bannerHome    || resolved.bannerHomeMobile),
      bannerContato: isMobile ? (resolved.bannerContatoMobile || resolved.bannerContato) : (resolved.bannerContato || resolved.bannerContatoMobile),
      bannerLogin:   isMobile ? (resolved.bannerLoginMobile   || resolved.bannerLogin)   : (resolved.bannerLogin   || resolved.bannerLoginMobile),
      bannerSobre:   isMobile ? (resolved.bannerSobreHyggeMobile || resolved.bannerSobreHygge) : (resolved.bannerSobreHygge || resolved.bannerSobreHyggeMobile),
      bannerProdutos: isMobile ? (resolved.bannerHomeMobile || resolved.bannerProdutos) : (resolved.bannerProdutos || resolved.bannerHome),
    };
    Promise.all(
      Object.entries(lqipTargets).map(async ([key, url]) => [key, await generateLqip(url)])
    ).then(entries => {
      try {
        const lqipCache = {};
        entries.forEach(([key, val]) => { if (val) lqipCache[key] = val; });
        if (Object.keys(lqipCache).length) localStorage.setItem(LQIP_CACHE_KEY, JSON.stringify(lqipCache));
      } catch (e) { /* ignore */ }
    });
  } catch (error) {
    console.error('[Assets] Falha em loadAppAssets:', error);
  }
}

window.addEventListener('scroll', applyHeaderScrollState);

document.addEventListener('DOMContentLoaded', () => {
  applyHeaderScrollState();
  startLogoObserver();
  applyCachedAssets();
  loadAppAssets();
});

// Re-aplica os banners quando o viewport cruza o breakpoint mobile/desktop
const mobileQuery = window.matchMedia('(max-width: 768px)');
mobileQuery.addEventListener('change', () => {
  loadAppAssets();
});
