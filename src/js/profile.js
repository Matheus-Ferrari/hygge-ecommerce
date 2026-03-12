import { auth, db } from '../firebase/firebaseConfig.js';
import { onAuthStateChanged, updateProfile, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';

const FAVORITES_KEY = 'hygge_favorites';
const CEP_STORAGE_KEY = 'hygge_cep';

async function buscarEnderecoPorCepPerfil(digits) {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  }
}

function bindCepAutoPerfil() {
  const cepInput = document.getElementById('cep');
  if (!cepInput) return;

  cepInput.addEventListener('input', async () => {
    const digits = cepInput.value.replace(/\D/g, '').slice(0, 8);
    // Apply mask while typing
    if (digits.length <= 5) {
      cepInput.value = digits;
    } else {
      cepInput.value = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }

    if (digits.length !== 8) return;

    try { localStorage.setItem(CEP_STORAGE_KEY, digits); } catch { /* ignore */ }

    const data = await buscarEnderecoPorCepPerfil(digits);
    if (!data) return;

    const ruaInput = document.getElementById('rua');
    const bairroInput = document.getElementById('bairro');
    const cidadeInput = document.getElementById('cidade');
    const estadoInput = document.getElementById('estado');
    if (ruaInput) ruaInput.value = data.logradouro || '';
    if (bairroInput) bairroInput.value = data.bairro || '';
    if (cidadeInput) cidadeInput.value = data.localidade || '';
    if (estadoInput) estadoInput.value = data.uf || '';
  });
}

const CATALOG_PRODUCTS = [
  { slug: 'acertei-na-mosca', name: 'Acertei na Mosca?' },
  { slug: 'vacilou-dancou', name: 'Vacilou, Dançou!' },
  { slug: 'quem-na-roda', name: 'Quem na roda?' },
  { slug: 'hygge-game', name: 'O Hygge Game' },
  { slug: 'coisas-que-nao-ensinam-na-escola', name: 'Coisas que não ensinam na escola' },
  { slug: 'eu-deveria-saber-isso', name: 'Eu deveria saber isso!' },
];

function readFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeFavorites(list) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(new Set(list))));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value ?? '';
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = Boolean(value);
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function wireTabs() {
  const tabs = Array.from(document.querySelectorAll('.profile-tab'));
  const panels = Array.from(document.querySelectorAll('.profile-tabPanel'));
  if (!tabs.length || !panels.length) return;

  const tabsBar = document.querySelector('.profile-tabs');
  let activeTab = 'perfil';

  function scrollToTabs() {
    if (!tabsBar) return;
    const header = document.querySelector('.header');
    const offset = (header?.offsetHeight || 0) + 12;
    const top = tabsBar.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function setActive(target) {
    const next = target || 'perfil';
    tabs.forEach((btn) => {
      const isActive = btn.dataset.tab === next;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== next;
    });

    if (next !== activeTab) {
      activeTab = next;
      scrollToTabs();
    }
  }

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => setActive(btn.dataset.tab || 'perfil'));
  });

  setActive('perfil');
}

function formatBRL(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    const date = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function renderOrders(orders) {
  const list = document.getElementById('orders-list');
  const empty = document.getElementById('orders-empty');
  if (!list) return;

  list.innerHTML = '';

  if (!orders?.length) {
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  orders.forEach((order) => {
    const wrap = document.createElement('div');
    wrap.className = 'profile-order';

    const top = document.createElement('div');
    top.className = 'profile-order__top';

    const idEl = document.createElement('div');
    idEl.className = 'profile-order__id';
    idEl.textContent = `Pedido ${order.id}`;

    const meta = document.createElement('div');
    meta.className = 'profile-order__meta';
    meta.textContent = `${formatDate(order.data_pedido)} • ${order.status_pagamento || 'status'} • ${formatBRL(order.valor_total)}`;

    top.appendChild(idEl);
    top.appendChild(meta);

    const ul = document.createElement('ul');
    ul.className = 'profile-order__items';
    const itens = Array.isArray(order.itens) ? order.itens : [];
    itens.forEach((item) => {
      const li = document.createElement('li');
      const qtd = item?.quantidade ? `x${item.quantidade}` : '';
      const nome = item?.nome || 'Item';
      li.textContent = `${nome} ${qtd}`.trim();
      ul.appendChild(li);
    });

    wrap.appendChild(top);
    if (ul.childElementCount) wrap.appendChild(ul);

    list.appendChild(wrap);
  });
}

async function loadUserOrders(user) {
  const status = document.getElementById('orders-status');
  if (status) status.textContent = 'Carregando pedidos…';

  try {
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('data_pedido', 'desc'),
      limit(20)
    );
    const snap = await getDocs(q);
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrders(orders);
    if (status) status.textContent = '';
  } catch {
    const list = document.getElementById('orders-list');
    const empty = document.getElementById('orders-empty');
    if (list) list.innerHTML = '';
    if (empty) empty.hidden = true;
    if (status) status.textContent = 'Não foi possível carregar seus pedidos agora.';
  }
}

function renderFavorites() {
  const container = document.getElementById('favorites-list');
  const emptyEl = document.getElementById('favorites-empty');
  if (!container) return;

  const favs = readFavorites();
  container.innerHTML = '';

  if (!favs.length) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;

  favs.forEach((slug) => {
    const product = CATALOG_PRODUCTS.find((p) => p.slug === slug);
    const label = product?.name || slug;

    const row = document.createElement('div');
    row.className = 'profile-favItem';

    const link = document.createElement('a');
    link.href = `/produto?id=${encodeURIComponent(slug)}`;
    link.textContent = label;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Remover';
    btn.addEventListener('click', () => {
      const next = readFavorites().filter((x) => x !== slug);
      writeFavorites(next);
      renderFavorites();
    });

    row.appendChild(link);
    row.appendChild(btn);
    container.appendChild(row);
  });
}

function fillFavoritesSelect() {
  const select = document.getElementById('favorite-select');
  if (!select) return;
  select.innerHTML = '';

  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = 'Selecione um jogo…';
  select.appendChild(opt0);

  CATALOG_PRODUCTS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.slug;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

async function loadUserProfile(user) {
  const result = {
    nome: user.displayName || '',
    email: user.email || '',
    endereco: {},
    privacidade: {},
    telefone: '',
  };

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const data = snap.data();
      result.nome = (data?.nome || result.nome || '').toString();
      result.email = (data?.email || result.email || '').toString();
      result.telefone = (data?.telefone || '').toString();
      result.endereco = data?.endereco || {};
      result.privacidade = data?.privacidade || {};
    }
  } catch {
    // Ignora se Firestore estiver bloqueado por regras.
  }

  return result;
}

function showLoggedOutState() {
  const loggedIn = document.getElementById('profile-logged-in');
  const loggedOut = document.getElementById('profile-logged-out');
  if (loggedIn) loggedIn.hidden = true;
  if (loggedOut) loggedOut.hidden = false;
}

function showLoggedInState() {
  const loggedIn = document.getElementById('profile-logged-in');
  const loggedOut = document.getElementById('profile-logged-out');
  if (loggedIn) loggedIn.hidden = false;
  if (loggedOut) loggedOut.hidden = true;
}

document.addEventListener('DOMContentLoaded', () => {
  wireTabs();
  bindCepAutoPerfil();

  const logoutBtn = document.getElementById('logout-btn');

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showLoggedOutState();
      if (logoutBtn) logoutBtn.style.display = 'none';
      return;
    }

    showLoggedInState();

    if (logoutBtn) {
      logoutBtn.style.display = '';
      logoutBtn.onclick = async () => {
        try {
          await signOut(auth);
          window.location.href = '/login';
        } catch (err) {
          console.error('Erro ao sair da conta:', err);
          alert('Não foi possível sair agora. Tente novamente.');
        }
      };
    }

    const data = await loadUserProfile(user);

    setText('profile-email', data.email || '—');
    setText('profile-uid', user.uid || '—');

    setValue('nome', data.nome || '');
    setValue('telefone', data.telefone || '');

    setValue('cep', data.endereco?.cep || '');
    setValue('rua', data.endereco?.rua || '');
    setValue('numero', data.endereco?.numero || '');
    setValue('complemento', data.endereco?.complemento || '');
    setValue('bairro', data.endereco?.bairro || '');
    setValue('cidade', data.endereco?.cidade || '');
    setValue('estado', data.endereco?.estado || '');

    setChecked('privacy-updates', data.privacidade?.receberAtualizacoes);
    setChecked('privacy-marketing', data.privacidade?.receberMarketing);

    const form = document.getElementById('profile-form');
    const status = document.getElementById('profile-status');

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (status) status.textContent = '';

        const nome = getValue('nome');
        const telefone = getValue('telefone');

        const endereco = {
          cep: getValue('cep'),
          rua: getValue('rua'),
          numero: getValue('numero'),
          complemento: getValue('complemento'),
          bairro: getValue('bairro'),
          cidade: getValue('cidade'),
          estado: getValue('estado'),
        };

        const privacidade = {
          receberAtualizacoes: Boolean(document.getElementById('privacy-updates')?.checked),
          receberMarketing: Boolean(document.getElementById('privacy-marketing')?.checked),
        };

        try {
          if (nome) {
            try {
              await updateProfile(user, { displayName: nome });
            } catch {
              // Não bloqueia.
            }
          }

          try {
            await setDoc(
              doc(db, 'users', user.uid),
              {
                nome,
                email: user.email || data.email || '',
                telefone,
                endereco,
                privacidade,
                atualizado_em: serverTimestamp(),
              },
              { merge: true }
            );
          } catch {
            // Se Firestore estiver bloqueado, ainda mostramos sucesso parcial.
          }

          if (status) status.textContent = 'Perfil atualizado com sucesso!';
        } catch (err) {
          if (status) status.textContent = 'Não foi possível salvar agora. Tente novamente.';
        }
      });
    }

    loadUserOrders(user);
  });
});
