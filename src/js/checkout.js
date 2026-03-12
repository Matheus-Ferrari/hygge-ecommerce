import { auth, db } from '../firebase/firebaseConfig.js';
import { iniciarPagamentoMP, obterCalculoFrete } from './checkoutService.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const CART_KEY = 'cart';
const CHECKOUT_DRAFT_KEY = 'checkout_draft';
const CHECKOUT_CUSTOMER_KEY = 'checkout_customer';
const CHECKOUT_CUSTOMER_DRAFT_KEY = 'checkout_customer_draft';
const CHECKOUT_OWNER_KEY = 'checkout_owner_id';
const CEP_STORAGE_KEY = 'hygge_cep';

let usuarioAtual = null;
let carrinhoAtual = [];
let subtotalAtual = 0;
let freteAtual = 0;
let freteOpcoes = [];
let freteSelecionadoKey = '';
let fretePrazoSelecionado = '';
let freteDebounceId = null;
let cupomAplicado = null;
let checkoutEmAndamento = false;
let customerMode = 'edit';

function mapUserDocToCustomerData(userDocData, user) {
  const data = userDocData || {};
  const endereco = data?.endereco || {};

  const customerData = {
    nome: String(data?.nome || user?.displayName || '').trim(),
    email: String(data?.email || user?.email || '').trim(),
    telefone: String(data?.telefone || '').trim(),
    cep: String(endereco?.cep || '').trim(),
    endereco: String(endereco?.rua || endereco?.endereco || '').trim(),
    numero: String(endereco?.numero || '').trim(),
    complemento: String(endereco?.complemento || '').trim(),
    cidade: String(endereco?.cidade || '').trim(),
    estado: String(endereco?.estado || '').trim(),
  };

  // Considera válido para preencher se tiver pelo menos algum campo útil.
  const hasAny = Object.values(customerData).some((v) => String(v || '').trim());
  return hasAny ? customerData : null;
}

async function carregarClienteSalvoFirestore(user) {
  if (!user?.uid) return null;

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return null;
    return mapUserDocToCustomerData(snap.data(), user);
  } catch {
    return null;
  }
}

async function salvarClienteNoFirestore(user, customerData) {
  if (!user?.uid) return;

  const payload = {
    nome: customerData.nome,
    email: customerData.email,
    telefone: customerData.telefone,
    endereco: {
      cep: customerData.cep,
      rua: customerData.endereco,
      numero: customerData.numero,
      complemento: customerData.complemento,
      cidade: customerData.cidade,
      estado: customerData.estado,
    },
    atualizado_em: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
}

function createRandomId() {
  try {
    // Preferível (moderno)
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  // Fallback simples
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getCheckoutOwnerId() {
  if (usuarioAtual?.uid) return String(usuarioAtual.uid);

  try {
    const existing = localStorage.getItem(CHECKOUT_OWNER_KEY);
    if (existing) return String(existing);
  } catch {
    // ignore
  }

  const created = `guest_${createRandomId()}`;
  try {
    localStorage.setItem(CHECKOUT_OWNER_KEY, created);
  } catch {
    // ignore
  }
  return created;
}

function getFreteKey(opcao) {
  const raw = opcao?.id ?? opcao?.nome ?? '';
  return String(raw);
}

function normalizarOpcoesFrete(lista) {
  const arr = Array.isArray(lista) ? lista : [];
  return arr
    .map((o) => ({
      id: o?.id ?? o?.codigo ?? o?.serviceId ?? o?.nome,
      nome: String(o?.nome || o?.servico || o?.service || 'Frete').trim(),
      valor: Number(o?.valor ?? o?.price ?? 0),
      prazo: String(o?.prazo || o?.deadline || '').trim(),
    }))
    .filter((o) => o.nome && Number.isFinite(o.valor) && o.valor >= 0);
}

function getSelectedFreteOption() {
  const key = getSelectedDeliveryMethod();
  return freteOpcoes.find((o) => getFreteKey(o) === String(key || '')) || null;
}

function selecionarFrete(opcao) {
  if (!opcao) return;
  freteSelecionadoKey = getFreteKey(opcao);
  freteAtual = Number(opcao.valor || 0);
  fretePrazoSelecionado = String(opcao.prazo || '').trim();
}

function renderDeliveryMessage(message) {
  const container = document.getElementById('delivery-options');
  if (!container) return;
  const text = String(message || '').trim();
  container.innerHTML = text
    ? `<div class="checkout-helper" style="grid-column:1/-1;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
    : '';
}

function renderDeliveryOptions() {
  const container = document.getElementById('delivery-options');
  if (!container) return;

  if (!freteOpcoes.length) {
    renderDeliveryMessage('Informe um CEP válido para calcular o frete.');
    return;
  }

  const selectedKey = freteSelecionadoKey;

  container.innerHTML = freteOpcoes
    .map((o, index) => {
      const key = getFreteKey(o);
      const checked = selectedKey ? key === selectedKey : index === 0;
      const subtitle = o.prazo ? o.prazo : 'Prazo indisponível';
      return `
        <label class="delivery-card${checked ? ' delivery-card--selected' : ''}">
          <input type="radio" name="delivery_method" value="${String(key).replace(/"/g, '&quot;')}" ${checked ? 'checked' : ''} />
          <span class="delivery-card__title">${o.nome}</span>
          <span class="delivery-card__price">${formatarPreco(o.valor)}</span>
          <span class="delivery-card__subtitle">${subtitle}</span>
        </label>
      `.trim();
    })
    .join('');

  // Se nada estava selecionado, fixa a primeira opção.
  const first = freteOpcoes[0];
  if (!freteSelecionadoKey && first) selecionarFrete(first);

  atualizarEstadoEntregaVisual();
}

function getCustomerStorageKey(user) {
  const owner = user?.uid ? String(user.uid) : 'guest';
  return `${CHECKOUT_CUSTOMER_KEY}:${owner}`;
}

function getCustomerDraftStorageKey(user) {
  const owner = user?.uid ? String(user.uid) : 'guest';
  return `${CHECKOUT_CUSTOMER_DRAFT_KEY}:${owner}`;
}

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function somenteDigitos(value) {
  return String(value || '').replace(/\D/g, '');
}

function salvarCepLocal(cep) {
  try { localStorage.setItem(CEP_STORAGE_KEY, cep); } catch { /* ignore */ }
}

function carregarCepLocal() {
  try { return localStorage.getItem(CEP_STORAGE_KEY) || ''; } catch { return ''; }
}

async function buscarEnderecoPorCep(digits) {
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

async function autoPreencherEnderecoDoCep(digits) {
  if (digits.length !== 8) return;
  const data = await buscarEnderecoPorCep(digits);
  if (!data) {
    const helper = document.getElementById('checkout-helper');
    if (helper && !helper.textContent) helper.textContent = 'CEP não encontrado. Verifique e tente novamente.';
    return;
  }
  const enderecoInput = document.getElementById('endereco');
  const cidadeInput = document.getElementById('cidade');
  const estadoInput = document.getElementById('estado');
  if (enderecoInput) enderecoInput.value = data.logradouro || '';
  if (cidadeInput) cidadeInput.value = data.localidade || '';
  if (estadoInput) estadoInput.value = data.uf || '';
  salvarCepLocal(digits);
  salvarRascunhoCliente();
}

function mascararCep(value) {
  const digits = somenteDigitos(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function mascararTelefone(value) {
  const digits = somenteDigitos(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizarItem(item) {
  return {
    id: String(item?.id || ''),
    nome: String(item?.nome || 'Produto'),
    descricao: String(item?.descricao || 'Jogo de cartas Hygge Games.'),
    preco: 119,
    imagem: String(item?.imagem || 'src/img/logo.png'),
    quantidade: Math.max(1, Number(item?.quantidade || 1)),
  };
}

function calcularSubtotal(itens) {
  return itens.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
}

function getCupomDesconto() {
  if (!cupomAplicado) return 0;
  if (cupomAplicado === 'HYGGE10') return subtotalAtual * 0.1;
  return 0;
}

function getTotal() {
  return Math.max(0, subtotalAtual + freteAtual - getCupomDesconto());
}

function getSelectedDeliveryMethod() {
  const selected = document.querySelector('input[name="delivery_method"]:checked');
  return selected?.value || '';
}

function atualizarEstadoEntregaVisual() {
  const cards = document.querySelectorAll('.delivery-card');
  cards.forEach((card) => {
    const radio = card.querySelector('input[type="radio"]');
    card.classList.toggle('delivery-card--selected', Boolean(radio?.checked));
  });
}

function atualizarTotais() {
  const subtotalEl = document.getElementById('summary-subtotal');
  const freteEl = document.getElementById('summary-frete');
  const totalEl = document.getElementById('summary-total');
  const discountRow = document.getElementById('summary-discount-row');
  const discountEl = document.getElementById('summary-discount');

  if (subtotalEl) subtotalEl.textContent = formatarPreco(subtotalAtual);
  if (freteEl) freteEl.textContent = formatarPreco(freteAtual);

  const desconto = getCupomDesconto();
  if (discountRow && discountEl) {
    if (desconto > 0) {
      discountRow.hidden = false;
      discountEl.textContent = `- ${formatarPreco(desconto)}`;
    } else {
      discountRow.hidden = true;
    }
  }

  if (totalEl) totalEl.textContent = formatarPreco(getTotal());
}

function carregarDraft() {
  try {
    const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : null;
    if (!draft) return;

    cupomAplicado = draft.cupom ? String(draft.cupom).toUpperCase() : null;
    if (draft.freteOpcaoId || draft.freteMetodo || draft.metodoEntregaId || draft.metodoEntrega) {
      freteSelecionadoKey = String(
        draft.freteOpcaoId || draft.metodoEntregaId || draft.metodoEntrega || draft.freteMetodo || ''
      );
    }

    if (Number.isFinite(Number(draft.frete)) && Number(draft.frete) >= 0) {
      freteAtual = Number(draft.frete);
    }

    if (draft.fretePrazo) {
      fretePrazoSelecionado = String(draft.fretePrazo || '').trim();
    }
  } catch {
    cupomAplicado = null;
  }
}

export function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    carrinhoAtual = Array.isArray(parsed) ? parsed.map(normalizarItem) : [];
  } catch {
    carrinhoAtual = [];
  }

  subtotalAtual = calcularSubtotal(carrinhoAtual);
  return carrinhoAtual;
}

export function renderOrderSummary() {
  const itemsEl = document.getElementById('checkout-summary-items');
  if (!itemsEl) return;

  itemsEl.innerHTML = '';

  if (!carrinhoAtual.length) {
    itemsEl.innerHTML = '<p class="checkout-helper">Seu carrinho está vazio. <a href="todos-os-jogos.html">Escolha produtos</a>.</p>';
    atualizarTotais();
    return;
  }

  carrinhoAtual.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'checkout-summary-item';
    row.innerHTML = `
      <img src="${item.imagem}" alt="${item.nome}" />
      <div>
        <h4>${item.nome}</h4>
        <p>Quantidade: ${item.quantidade}</p>
        <p>${formatarPreco(item.preco)}</p>
      </div>
    `;
    itemsEl.appendChild(row);
  });

  atualizarTotais();
}

function getCustomerFormData() {
  return {
    nome: String(document.getElementById('nome')?.value || '').trim(),
    email: String(document.getElementById('email')?.value || '').trim(),
    telefone: String(document.getElementById('telefone')?.value || '').trim(),
    cep: String(document.getElementById('cep')?.value || '').trim(),
    endereco: String(document.getElementById('endereco')?.value || '').trim(),
    numero: String(document.getElementById('numero')?.value || '').trim(),
    complemento: String(document.getElementById('complemento')?.value || '').trim(),
    cidade: String(document.getElementById('cidade')?.value || '').trim(),
    estado: String(document.getElementById('estado')?.value || '').trim(),
  };
}

function salvarRascunhoCliente() {
  try {
    const data = getCustomerFormData();
    localStorage.setItem(
      getCustomerDraftStorageKey(usuarioAtual),
      JSON.stringify({ ...data, atualizadoEm: Date.now() })
    );
  } catch {
    // Ignora falhas de storage.
  }
}

function carregarRascunhoCliente() {
  try {
    const raw = localStorage.getItem(getCustomerDraftStorageKey(usuarioAtual));
    const data = raw ? JSON.parse(raw) : null;
    return data || null;
  } catch {
    return null;
  }
}

function preencherFormularioCliente(data) {
  if (!data) return;
  const ids = ['nome', 'email', 'telefone', 'cep', 'endereco', 'numero', 'complemento', 'cidade', 'estado'];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input || data[id] == null) return;
    input.value = String(data[id]);
  });
}

function validateCustomerData(data) {
  const obrigatorios = ['nome', 'email', 'telefone', 'cep', 'endereco', 'numero', 'cidade', 'estado'];
  const faltando = obrigatorios.find((campo) => !String(data[campo] || '').trim());

  if (faltando) return { ok: false, message: 'Preencha todos os dados do cliente.' };
  if (!data.email.includes('@')) return { ok: false, message: 'Informe um email válido.' };
  if (somenteDigitos(data.cep).length !== 8) return { ok: false, message: 'Informe um CEP válido com 8 dígitos.' };
  if (somenteDigitos(data.telefone).length < 10) return { ok: false, message: 'Informe um telefone válido com DDD.' };

  return { ok: true };
}

function renderCustomerReadonly(data) {
  const readonly = document.getElementById('customer-readonly');
  if (!readonly) return;

  readonly.innerHTML = `
    <div class="checkout-readonly__item"><p class="checkout-readonly__label">Nome</p><p class="checkout-readonly__value">${data.nome}</p></div>
    <div class="checkout-readonly__item"><p class="checkout-readonly__label">Email</p><p class="checkout-readonly__value">${data.email}</p></div>
    <div class="checkout-readonly__item"><p class="checkout-readonly__label">Telefone</p><p class="checkout-readonly__value">${data.telefone}</p></div>
    <div class="checkout-readonly__item"><p class="checkout-readonly__label">CEP</p><p class="checkout-readonly__value">${data.cep}</p></div>
    <div class="checkout-readonly__item checkout-readonly__item--full"><p class="checkout-readonly__label">Endereço</p><p class="checkout-readonly__value">${data.endereco}, ${data.numero}${data.complemento ? ` - ${data.complemento}` : ''}</p></div>
    <div class="checkout-readonly__item"><p class="checkout-readonly__label">Cidade</p><p class="checkout-readonly__value">${data.cidade}</p></div>
    <div class="checkout-readonly__item"><p class="checkout-readonly__label">Estado</p><p class="checkout-readonly__value">${data.estado}</p></div>
  `;
}

function setCustomerMode(mode) {
  customerMode = mode;
  const form = document.getElementById('checkout-form');
  const readonly = document.getElementById('customer-readonly');
  const saveBtn = document.getElementById('customer-save-btn');
  const editBtn = document.getElementById('customer-edit-btn');

  if (!form || !readonly || !saveBtn || !editBtn) return;

  const isView = mode === 'view';
  form.hidden = isView;
  readonly.hidden = !isView;
  saveBtn.hidden = isView;
  editBtn.hidden = !isView;
}

function carregarClienteSalvo() {
  try {
    const raw = localStorage.getItem(getCustomerStorageKey(usuarioAtual));
    const data = raw ? JSON.parse(raw) : null;
    if (!data) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveCustomerData() {
  const helper = document.getElementById('checkout-helper');
  if (helper) helper.textContent = '';

  const form = document.getElementById('checkout-form');
  if (form && typeof form.reportValidity === 'function' && !form.reportValidity()) {
    salvarRascunhoCliente();
    return null;
  }

  const data = getCustomerFormData();
  const validation = validateCustomerData(data);
  if (!validation.ok) {
    if (helper) helper.textContent = validation.message;

    salvarRascunhoCliente();

    const campoAlvo =
      validation.message?.includes('email') ? 'email' :
      validation.message?.includes('CEP') ? 'cep' :
      validation.message?.includes('telefone') ? 'telefone' :
      'nome';

    document.getElementById(campoAlvo)?.focus();
    return null;
  }

  localStorage.setItem(getCustomerStorageKey(usuarioAtual), JSON.stringify(data));
  try {
    localStorage.removeItem(getCustomerDraftStorageKey(usuarioAtual));
  } catch {
    // ignore
  }
  renderCustomerReadonly(data);
  setCustomerMode('view');
  return data;
}

async function upsertOrderDraft(customerData) {
  const ownerId = getCheckoutOwnerId();
  if (!ownerId) throw new Error('Identificador do checkout ausente.');

  const selectedOption = getSelectedFreteOption();
  const methodKey = getSelectedDeliveryMethod();
  const methodName = selectedOption?.nome || null;
  const now = serverTimestamp();

  const payload = {
    userId: ownerId,
    nome: customerData.nome,
    email: customerData.email,
    telefone: customerData.telefone,
    endereco: `${customerData.endereco}, ${customerData.numero}${customerData.complemento ? ` - ${customerData.complemento}` : ''}`,
    numero: customerData.numero,
    cidade: customerData.cidade,
    estado: customerData.estado,
    cep: customerData.cep,
    produtos: carrinhoAtual,
    subtotal: subtotalAtual,
    frete: freteAtual,
    freteOpcaoId: selectedOption ? getFreteKey(selectedOption) : (methodKey || null),
    freteMetodo: methodName,
    fretePrazo: selectedOption?.prazo || null,
    cupom: cupomAplicado || null,
    total: getTotal(),
    complemento: customerData.complemento,
    metodoEntrega: methodName || (methodKey || null),
    updatedAt: now,
  };

  const ref = doc(db, 'orders_draft', String(ownerId));
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    payload.createdAt = now;
  }

  await setDoc(ref, payload, { merge: true });
  return { id: ref.id, payload };
}

function atualizarCardLogin(user) {
  const loginCard = document.getElementById('checkout-login-card');
  if (!loginCard) return;
  loginCard.style.display = user ? 'none' : '';
}

function preencherCamposUsuario(user) {
  if (!user) return;
  const nomeInput = document.getElementById('nome');
  const emailInput = document.getElementById('email');

  if (nomeInput && user.displayName && !nomeInput.value) nomeInput.value = user.displayName;
  if (emailInput && user.email && !emailInput.value) emailInput.value = user.email;
}

function renderCheckoutCouponState() {
  const stateEl = document.getElementById('checkout-coupon-state');
  if (!stateEl) return;

  const desconto = getCupomDesconto();
  if (!cupomAplicado || desconto <= 0) {
    stateEl.innerHTML = '';
    return;
  }

  stateEl.innerHTML = `
    <div class="cart-coupon__applied">
      <span>Cupom aplicado: ${cupomAplicado}</span>
      <button id="checkout-coupon-remove" class="cart-coupon__remove" type="button">Remover</button>
    </div>
  `;

  const removeBtn = document.getElementById('checkout-coupon-remove');
  removeBtn?.addEventListener('click', () => {
    cupomAplicado = null;
    const input = document.getElementById('checkout-coupon-input');
    if (input) input.value = '';
    atualizarTotais();
    renderCheckoutCouponState();
  });
}

async function recalcularFreteCheckout() {
  const cepInput = document.getElementById('cep');
  const digits = somenteDigitos(cepInput?.value || '').slice(0, 8);

  if (!carrinhoAtual.length) {
    freteOpcoes = [];
    freteAtual = 0;
    renderDeliveryMessage('Seu carrinho está vazio.');
    atualizarTotais();
    return;
  }

  if (digits.length !== 8) {
    freteOpcoes = [];
    freteAtual = 0;
    renderDeliveryMessage('Informe um CEP válido para calcular o frete.');
    atualizarTotais();
    return;
  }

  renderDeliveryMessage('Calculando frete...');
  const resultado = await obterCalculoFrete(digits, carrinhoAtual);

  if (!Array.isArray(resultado)) {
    freteOpcoes = [];
    freteAtual = 0;
    renderDeliveryMessage(resultado?.mensagem || 'Não foi possível calcular o frete agora.');
    atualizarTotais();
    return;
  }

  freteOpcoes = normalizarOpcoesFrete(resultado);
  if (!freteOpcoes.length) {
    freteAtual = 0;
    renderDeliveryMessage('Nenhuma opção de frete disponível para este CEP.');
    atualizarTotais();
    return;
  }

  let selected = freteSelecionadoKey
    ? freteOpcoes.find((o) => getFreteKey(o) === freteSelecionadoKey)
    : null;

  if (!selected && Number.isFinite(freteAtual) && freteAtual > 0) {
    selected = freteOpcoes.find((o) => Math.abs(Number(o.valor) - Number(freteAtual)) < 0.01) || null;
  }

  if (!selected) {
    selected = freteOpcoes.reduce((best, cur) => (!best || cur.valor < best.valor ? cur : best), null);
  }

  selecionarFrete(selected || freteOpcoes[0]);
  renderDeliveryOptions();
  atualizarTotais();
  renderCheckoutCouponState();
}

function agendarCalculoFrete(imediato = false) {
  if (freteDebounceId) window.clearTimeout(freteDebounceId);
  const wait = imediato ? 0 : 450;
  freteDebounceId = window.setTimeout(() => {
    recalcularFreteCheckout();
  }, wait);
}

function bindDeliveryEvents() {
  const container = document.getElementById('delivery-options');
  if (!container) return;

  container.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== 'delivery_method') return;

    const key = String(target.value || '');
    const selected = freteOpcoes.find((o) => getFreteKey(o) === key) || null;
    if (!selected) return;

    selecionarFrete(selected);
    atualizarEstadoEntregaVisual();
    atualizarTotais();
    renderCheckoutCouponState();
  });
}

function bindCouponEvents() {
  const input = document.getElementById('checkout-coupon-input');
  const btn = document.getElementById('checkout-coupon-apply');
  const helper = document.getElementById('checkout-helper');

  if (input && cupomAplicado) input.value = cupomAplicado;

  btn?.addEventListener('click', () => {
    const code = String(input?.value || '').trim().toUpperCase();
    if (helper) helper.textContent = '';

    if (!code) {
      cupomAplicado = null;
      renderCheckoutCouponState();
      atualizarTotais();
      return;
    }

    if (code === 'HYGGE10') {
      cupomAplicado = code;
      renderCheckoutCouponState();
      atualizarTotais();
      return;
    }

    cupomAplicado = null;
    renderCheckoutCouponState();
    atualizarTotais();
    if (helper) helper.textContent = 'Código promocional inválido.';
  });
}

function bindCustomerEvents() {
  const saveBtn = document.getElementById('customer-save-btn');
  const editBtn = document.getElementById('customer-edit-btn');

  saveBtn?.addEventListener('click', async () => {
    const helper = document.getElementById('checkout-helper');
    if (helper) helper.textContent = '';

    const data = saveCustomerData();
    if (!data) return;

    try {
      await upsertOrderDraft(data);
      // Se estiver logado, também mantém os dados no perfil do usuário.
      if (usuarioAtual?.uid) {
        try {
          await salvarClienteNoFirestore(usuarioAtual, data);
        } catch (err) {
          console.warn('Não foi possível sincronizar dados do cliente no perfil:', err);
        }
      }

      if (helper) helper.textContent = 'Dados salvos com sucesso.';
    } catch (err) {
      console.error('Erro ao salvar pedido em rascunho:', err);
      if (helper) helper.textContent = 'Não foi possível salvar seus dados agora. Tente novamente.';
    }
  });

  editBtn?.addEventListener('click', () => {
    setCustomerMode('edit');
  });

  const cepInput = document.getElementById('cep');
  const telefoneInput = document.getElementById('telefone');
  cepInput?.addEventListener('input', () => {
    cepInput.value = mascararCep(cepInput.value);
    salvarRascunhoCliente();
    const digits = somenteDigitos(cepInput.value);
    if (digits.length === 8) autoPreencherEnderecoDoCep(digits);
    agendarCalculoFrete();
  });
  telefoneInput?.addEventListener('input', () => {
    telefoneInput.value = mascararTelefone(telefoneInput.value);
    salvarRascunhoCliente();
  });

  const ids = ['nome', 'email', 'telefone', 'cep', 'endereco', 'numero', 'complemento', 'cidade', 'estado'];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    input?.addEventListener('blur', salvarRascunhoCliente);
  });
}

function atualizarEstadoBotao(emAndamento) {
  const button = document.getElementById('checkout-submit');
  if (!button) return;
  button.disabled = emAndamento;
  button.textContent = emAndamento ? 'Processando...' : 'Continuar para pagamento';
}

async function salvarPedidoFirestore(customerData) {
  return upsertOrderDraft(customerData);
}

export async function startCheckout() {
  if (checkoutEmAndamento) return;

  const helper = document.getElementById('checkout-helper');
  if (helper) helper.textContent = '';

  if (!carrinhoAtual.length) {
    if (helper) helper.textContent = 'Seu carrinho está vazio.';
    return;
  }

  let customerData = customerMode === 'view' ? carregarClienteSalvo() : null;
  if (!customerData) {
    customerData = saveCustomerData();
  }

  if (!customerData) {
    if (helper) helper.textContent = helper.textContent || 'Preencha e salve os dados do cliente.';
    return;
  }

  try {
    checkoutEmAndamento = true;
    atualizarEstadoBotao(true);

    await salvarPedidoFirestore(customerData);

    const methodKey = getSelectedDeliveryMethod();
    const selectedOption = getSelectedFreteOption();
    const total = getTotal();

    const ownerId = getCheckoutOwnerId();

    localStorage.setItem(
      'last_order',
      JSON.stringify({
        userId: ownerId,
        itens: carrinhoAtual,
        subtotal: subtotalAtual,
        frete: freteAtual,
        freteOpcaoId: selectedOption ? getFreteKey(selectedOption) : (methodKey || null),
        freteMetodo: selectedOption?.nome || null,
        fretePrazo: selectedOption?.prazo || null,
        desconto: getCupomDesconto(),
        total,
        cupom: cupomAplicado || null,
        metodoEntregaId: methodKey || null,
        metodoEntrega: selectedOption?.nome || (methodKey || null),
        criadoEm: Date.now(),
      })
    );

    localStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify({
        userId: ownerId,
        itens: carrinhoAtual,
        subtotal: subtotalAtual,
        frete: freteAtual,
        freteOpcaoId: selectedOption ? getFreteKey(selectedOption) : (methodKey || null),
        freteMetodo: selectedOption?.nome || null,
        fretePrazo: selectedOption?.prazo || null,
        desconto: getCupomDesconto(),
        total,
        cupom: cupomAplicado || null,
        cep: customerData.cep,
        metodoEntregaId: methodKey || null,
        metodoEntrega: selectedOption?.nome || (methodKey || null),
        criadoEm: Date.now(),
      })
    );

    const pref = await iniciarPagamentoMP(carrinhoAtual, getCheckoutOwnerId());
    const initPoint = pref?.init_point || pref?.initPoint || '';
    if (!initPoint) {
      if (helper) helper.textContent = 'Não foi possível iniciar o pagamento agora. Tente novamente.';
      checkoutEmAndamento = false;
      atualizarEstadoBotao(false);
      return;
    }

    window.location.href = initPoint;
  } catch (error) {
    console.error('Erro ao iniciar checkout:', error);
    if (helper) helper.textContent = 'Não foi possível iniciar o pagamento agora. Tente novamente.';
    checkoutEmAndamento = false;
    atualizarEstadoBotao(false);
  }
}

function bindCheckoutAction() {
  const submitBtn = document.getElementById('checkout-submit');
  submitBtn?.addEventListener('click', startCheckout);
}

function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    usuarioAtual = user || null;
    atualizarCardLogin(user);
    preencherCamposUsuario(user);

    const loginAnchor = document.querySelector('#checkout-login-message a');
    if (loginAnchor) {
      loginAnchor.setAttribute('href', user ? 'perfil.html' : 'login.html?redirect=checkout');
    }

    // Agora que sabemos o usuário (ou guest), carregamos os dados do cliente
    // sem risco de vazar informações entre contas.
    await initCustomerCard();
    agendarCalculoFrete(true);
  });
}

async function initCustomerCard() {
  // Migração segura (legado): havia uma chave única "checkout_customer".
  // Para evitar vazamento, só migra quando:
  // - usuário não logado (guest), OU
  // - email salvo bate com o email do usuário atual.
  try {
    const legacyRaw = localStorage.getItem(CHECKOUT_CUSTOMER_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const legacyEmail = String(legacy?.email || '').trim().toLowerCase();
      const userEmail = String(usuarioAtual?.email || '').trim().toLowerCase();
      const canMigrate = !usuarioAtual || (legacyEmail && userEmail && legacyEmail === userEmail);
      if (canMigrate && !localStorage.getItem(getCustomerStorageKey(usuarioAtual))) {
        localStorage.setItem(getCustomerStorageKey(usuarioAtual), JSON.stringify(legacy));
      }
      // Remove sempre a chave antiga para não vazar entre usuários.
      localStorage.removeItem(CHECKOUT_CUSTOMER_KEY);
    }
  } catch {
    // ignore
  }

  const savedCustomer = carregarClienteSalvo();
  if (savedCustomer) {
    preencherFormularioCliente(savedCustomer);
    renderCustomerReadonly(savedCustomer);
    setCustomerMode('view');
    return;
  }

  // Se o usuário estiver logado e não houver dados locais, tenta buscar do Firestore.
  if (usuarioAtual?.uid) {
    const remote = await carregarClienteSalvoFirestore(usuarioAtual);
    if (remote) {
      // Salva localmente também para ficar rápido nos próximos acessos.
      try {
        localStorage.setItem(getCustomerStorageKey(usuarioAtual), JSON.stringify(remote));
      } catch {
        // ignore
      }

      preencherFormularioCliente(remote);

      const validation = validateCustomerData(remote);
      if (validation.ok) {
        renderCustomerReadonly(remote);
        setCustomerMode('view');
      } else {
        setCustomerMode('edit');
      }
      return;
    }
  }

  const draftCustomer = carregarRascunhoCliente();
  if (draftCustomer) {
    preencherFormularioCliente(draftCustomer);
  } else {
    // Pre-fill CEP from shared localStorage if present
    const savedCep = carregarCepLocal();
    if (savedCep) {
      const cepEl = document.getElementById('cep');
      if (cepEl && !cepEl.value) cepEl.value = mascararCep(savedCep);
    }
  }
  setCustomerMode('edit');
}

function init() {
  const loginAnchor = document.querySelector('#checkout-login-message a');
  if (loginAnchor) loginAnchor.setAttribute('href', 'login.html?redirect=checkout');

  loadCart();
  carregarDraft();
  bindDeliveryEvents();
  renderDeliveryOptions();
  atualizarEstadoEntregaVisual();
  bindCustomerEvents();
  bindCouponEvents();
  renderOrderSummary();
  renderCheckoutCouponState();
  bindCheckoutAction();
  initAuth();
}

document.addEventListener('DOMContentLoaded', init);
