import { doc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/firebaseConfig.js';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

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

    const bannerHome    = isMobile ? (resolved.bannerHomeMobile    || resolved.bannerHome)    : (resolved.bannerHome    || resolved.bannerHomeMobile);
    const bannerContato = isMobile ? (resolved.bannerContatoMobile || resolved.bannerContato) : (resolved.bannerContato || resolved.bannerContatoMobile);
    const bannerLogin   = isMobile ? (resolved.bannerLoginMobile   || resolved.bannerLogin)   : (resolved.bannerLogin   || resolved.bannerLoginMobile);
    const bannerSobre   = isMobile ? (resolved.bannerSobreHyggeMobile || resolved.bannerSobreHygge) : (resolved.bannerSobreHygge || resolved.bannerSobreHyggeMobile);

    document.querySelectorAll('.logo-img, img[alt="Logo Hygge Games"]').forEach((img) =>
      applyImageSrc(img, resolved.logo)
    );
    applyImageSrc(document.getElementById('banner-home'), bannerHome);
    applyImageSrc(document.getElementById('banner-contato'), bannerContato);
    applyImageSrc(document.getElementById('banner-login'), bannerLogin);
    const bannerProdutos = isMobile ? (bannerHome || resolved.bannerProdutos) : (resolved.bannerProdutos || bannerHome);
    applyImageSrc(document.getElementById('banner-produtos'), bannerProdutos);
    applyImageSrc(document.getElementById('banner-sobre'), bannerSobre);
    applyImageSrc(document.getElementById('icone-sobre1'), resolved.pngsobrehygge1);
    applyImageSrc(document.getElementById('icone-sustentabilidade'), resolved.pngsobrehygge2);
    applyImageSrc(document.getElementById('icone-producao'), resolved.pngsobrehygge3);
  } catch (error) {
    console.error('[Assets] Falha em loadAppAssets:', error);
  }
}

window.addEventListener('scroll', applyHeaderScrollState);

document.addEventListener('DOMContentLoaded', () => {
  applyHeaderScrollState();
  loadAppAssets();
});

// Re-aplica os banners quando o viewport cruza o breakpoint mobile/desktop
const mobileQuery = window.matchMedia('(max-width: 768px)');
mobileQuery.addEventListener('change', () => {
  loadAppAssets();
});
