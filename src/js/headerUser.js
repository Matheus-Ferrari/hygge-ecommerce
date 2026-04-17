import { auth, db } from '../firebase/firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

function getFirstName(fullName) {
  const name = (fullName || '').trim();
  if (!name) return '';
  return name.split(/\s+/)[0];
}

function buildUserButtonHtml(firstName) {
  const safeName = (firstName || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  return `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:8px;">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
    <span class="btn-entrar__text"><span class="btn-entrar__greeting">Olá</span><span class="btn-entrar__name">, ${safeName}</span></span>
  `.trim();
}

async function getPreferredUserName(user) {
  const displayName = (user?.displayName || '').trim();
  if (displayName) return displayName;

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.exists() ? snap.data() : null;
    const nome = (data?.nome || '').trim();
    if (nome) return nome;
  } catch {
    // Ignora se Firestore estiver bloqueado por regras.
  }

  return '';
}

function updateHeaderButtonLoggedOut(btn) {
  btn.classList.remove('btn-entrar--user');
  const onCheckout = /\/checkout\.html$/i.test(window.location.pathname || '');
  btn.setAttribute('href', onCheckout ? '/login?redirect=checkout' : '/login');
  btn.setAttribute('aria-label', 'Entrar');
  btn.style.marginLeft = '';
  btn.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:8px;"><path d="M9 18l6-6-6-6"/><path d="M15 12H3"/><rect x="17" y="3" width="4" height="18" rx="2"/></svg>
    <span>Entrar</span>
  `.trim();
}

function updateHeaderButtonLoggedIn(btn, name) {
  const firstName = getFirstName(name) || 'cliente';
  btn.classList.add('btn-entrar--user');
  btn.setAttribute('href', '/perfil');
  btn.setAttribute('aria-label', `Ir para o perfil: ${firstName}`);
  btn.style.marginLeft = '';
  btn.innerHTML = buildUserButtonHtml(firstName);
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.header .btn-entrar');
  if (!btn) return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      updateHeaderButtonLoggedOut(btn);
      return;
    }

    const name = await getPreferredUserName(user);
    updateHeaderButtonLoggedIn(btn, name);
  });
});
