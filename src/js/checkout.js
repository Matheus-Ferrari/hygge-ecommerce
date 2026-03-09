import { auth, db } from '../firebase/firebaseConfig.js';
import { iniciarPagamentoMP } from './checkoutService.js';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const CART_KEY = 'cart';
const CHECKOUT_DRAFT_KEY = 'checkout_draft';
const CHECKOUT_CUSTOMER_KEY = 'checkout_customer';
const CHECKOUT_CUSTOMER_DRAFT_KEY = 'checkout_customer_draft';

const DELIVERY_OPTIONS = {
  padrao: { label: 'Entrega padrão', price: 11.9 },
  grande_sp: { label: 'Grande São Paulo', price: 15.9 },
};

let usuarioAtual = null;
let carrinhoAtual = [];
let subtotalAtual = 0;
let freteAtual = DELIVERY_OPTIONS.padrao.price;
let cupomAplicado = null;
let checkoutEmAndamento = false;
let customerMode = 'edit';

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
    preco: Number(item?.preco || 0),
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
  return selected?.value || 'padrao';
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
    if (Number.isFinite(Number(draft.frete)) && Number(draft.frete) > 0) {
      freteAtual = Number(draft.frete);
      const method = Number(draft.frete) >= DELIVERY_OPTIONS.grande_sp.price ? 'grande_sp' : 'padrao';
      const radio = document.querySelector(`input[name="delivery_method"][value="${method}"]`);
      if (radio) radio.checked = true;
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

function bindDeliveryEvents() {
  const radios = document.querySelectorAll('input[name="delivery_method"]');
  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      const method = getSelectedDeliveryMethod();
      freteAtual = DELIVERY_OPTIONS[method]?.price || DELIVERY_OPTIONS.padrao.price;
      atualizarEstadoEntregaVisual();
      atualizarTotais();
      renderCheckoutCouponState();
    });
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

  saveBtn?.addEventListener('click', () => {
    saveCustomerData();
  });

  editBtn?.addEventListener('click', () => {
    setCustomerMode('edit');
  });

  const cepInput = document.getElementById('cep');
  const telefoneInput = document.getElementById('telefone');
  cepInput?.addEventListener('input', () => {
    cepInput.value = mascararCep(cepInput.value);
    salvarRascunhoCliente();
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
  const method = getSelectedDeliveryMethod();
  const payload = {
    userId: usuarioAtual?.uid || 'guest',
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
    cupom: cupomAplicado || null,
    total: getTotal(),
    data: serverTimestamp(),
    complemento: customerData.complemento,
    metodoEntrega: method,
  };

  const ref = await addDoc(collection(db, 'orders_draft'), payload);
  return { id: ref.id, payload };
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

    const method = getSelectedDeliveryMethod();
    const total = getTotal();

    localStorage.setItem(
      'last_order',
      JSON.stringify({
        itens: carrinhoAtual,
        subtotal: subtotalAtual,
        frete: freteAtual,
        desconto: getCupomDesconto(),
        total,
        cupom: cupomAplicado || null,
        metodoEntrega: method,
        criadoEm: Date.now(),
      })
    );

    localStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify({
        itens: carrinhoAtual,
        subtotal: subtotalAtual,
        frete: freteAtual,
        desconto: getCupomDesconto(),
        total,
        cupom: cupomAplicado || null,
        cep: customerData.cep,
        criadoEm: Date.now(),
      })
    );

    await iniciarPagamentoMP(carrinhoAtual, usuarioAtual?.uid || 'guest');
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
  onAuthStateChanged(auth, (user) => {
    usuarioAtual = user || null;
    atualizarCardLogin(user);
    preencherCamposUsuario(user);

    // Agora que sabemos o usuário (ou guest), carregamos os dados do cliente
    // sem risco de vazar informações entre contas.
    initCustomerCard();
  });
}

function initCustomerCard() {
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

  const draftCustomer = carregarRascunhoCliente();
  if (draftCustomer) preencherFormularioCliente(draftCustomer);
  setCustomerMode('edit');
}

function init() {
  loadCart();
  bindDeliveryEvents();
  carregarDraft();
  atualizarEstadoEntregaVisual();
  bindCustomerEvents();
  bindCouponEvents();
  renderOrderSummary();
  renderCheckoutCouponState();
  bindCheckoutAction();
  initAuth();
}

document.addEventListener('DOMContentLoaded', init);
