import { iniciarPagamentoMP, obterCalculoFrete } from './checkoutService.js';
import { auth } from '../firebase/firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';

let usuarioId = null;
let freteAtual = 0;

const CART_KEY = 'cart';
const LEGACY_CART_KEY = 'carrinho';

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function normalizarItem(item) {
  return {
    id: String(item?.id || ''),
    nome: String(item?.nome || 'Produto'),
    preco: Number(item?.preco || 0),
    imagem: String(item?.imagem || 'src/img/logo.png'),
    quantidade: Math.max(1, Number(item?.quantidade || 1)),
  };
}

function lerCarrinho() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.map(normalizarItem);

    // Migra chave antiga para a nova apenas se necessário.
    const legacyRaw = localStorage.getItem(LEGACY_CART_KEY);
    const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : [];
    const migrated = Array.isArray(legacyParsed) ? legacyParsed.map(normalizarItem) : [];
    salvarCarrinho(migrated);
    localStorage.removeItem(LEGACY_CART_KEY);
    return migrated;
  } catch {
    return [];
  }
}

function salvarCarrinho(itens) {
  localStorage.setItem(CART_KEY, JSON.stringify(itens.map(normalizarItem)));
}

function removerItem(id) {
  const itens = lerCarrinho().filter((item) => item.id !== id);
  salvarCarrinho(itens);
  renderCarrinho();
}

function atualizarQuantidade(id, quantidade) {
  const qtd = Math.max(1, Math.floor(Number(quantidade || 1)));
  const itens = lerCarrinho().map((item) =>
    item.id === id ? { ...item, quantidade: qtd } : item
  );
  salvarCarrinho(itens);
  renderCarrinho();
}

function calcularSubtotal(itens) {
  return itens.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
}

function getAprovadoByQuery() {
  const params = new URLSearchParams(window.location.search);
  const status = (params.get('status') || params.get('collection_status') || '').toLowerCase();
  return status === 'approved';
}

function renderCarrinhoVazio(container) {
  const wrapper = document.createElement('div');
  wrapper.style.textAlign = 'center';
  wrapper.style.padding = '56px 0';

  wrapper.innerHTML = `
    <p style="font-size:1.3rem; font-weight:600; margin-bottom:24px;">Seu carrinho está vazio</p>
    <a href="todos-os-jogos.html" class="btn-comprar" style="display:inline-block;">Ver produtos</a>
  `;

  container.appendChild(wrapper);
}

function criarItemCard(item) {
  const subtotal = item.preco * item.quantidade;

  const card = document.createElement('article');
  card.className = 'produto-card';
  card.style.padding = '18px';
  card.style.margin = '0 0 16px 0';
  card.style.minHeight = 'auto';
  card.style.borderRadius = '20px';
  card.style.background = '#fff';
  card.style.display = 'grid';
  card.style.gridTemplateColumns = '110px 1fr';
  card.style.gap = '16px';
  card.style.alignItems = 'center';

  card.innerHTML = `
    <div class="produto-img-bg" style="width:110px; height:110px; border-radius:16px;">
      <img src="${item.imagem}" alt="${item.nome}" class="produto-img" style="max-width:90px; max-height:90px; object-fit:contain;" />
    </div>
    <div>
      <h3 class="product-card__title" style="margin:0 0 8px 0; font-size:1.35rem;">${item.nome}</h3>
      <p style="margin:0 0 8px 0; font-weight:600; color:#008366;">Preço: ${formatarPreco(item.preco)}</p>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
        <label for="qtd-${item.id}" style="font-weight:600;">Quantidade</label>
        <input id="qtd-${item.id}" type="number" min="1" value="${item.quantidade}" style="width:68px; padding:6px 8px; border-radius:10px; border:1px solid #d3cec8;" />
      </div>
      <p style="margin:0 0 10px 0; font-weight:700;">Subtotal: ${formatarPreco(subtotal)}</p>
      <button class="btn-comprar" type="button" style="background:#b71c1c; margin:0;">Remover</button>
    </div>
  `;

  const qtdInput = card.querySelector('input[type="number"]');
  const removerBtn = card.querySelector('button');

  qtdInput?.addEventListener('change', (e) => {
    atualizarQuantidade(item.id, e.target.value);
  });

  removerBtn?.addEventListener('click', () => {
    removerItem(item.id);
  });

  return card;
}

async function calcularFretePorCep(cep, itens) {
  const somenteDigitos = (cep || '').replace(/\D/g, '');
  if (somenteDigitos.length !== 8) return;

  const resultado = await obterCalculoFrete(somenteDigitos, itens);
  if (resultado?.erro) {
    freteAtual = 0;
    renderCarrinho('Nao foi possivel calcular o frete agora.');
    return;
  }

  freteAtual = Number(resultado?.valor || 0);
  renderCarrinho();
}

function renderResumo(container, itens, avisoFrete = '') {
  const subtotal = calcularSubtotal(itens);
  const total = subtotal + freteAtual;

  const aside = document.createElement('aside');
  aside.className = 'produto-card';
  aside.style.padding = '24px';
  aside.style.margin = '0';
  aside.style.minHeight = 'auto';
  aside.style.borderRadius = '20px';
  aside.style.alignSelf = 'start';

  aside.innerHTML = `
    <h3 class="product-card__title" style="margin:0 0 16px 0;">Resumo do Pedido</h3>
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span>Subtotal</span><strong>${formatarPreco(subtotal)}</strong></div>
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span>Frete</span><strong>${freteAtual ? formatarPreco(freteAtual) : '--'}</strong></div>
    <div style="display:flex; justify-content:space-between; margin: 0 0 14px 0; font-size:1.15rem;"><span>Total</span><strong>${formatarPreco(total)}</strong></div>
    <label for="cep-input" style="display:block; margin-bottom:6px; font-weight:600;">Digite seu CEP</label>
    <input id="cep-input" type="text" maxlength="9" placeholder="00000-000" style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #d3cec8; margin-bottom:8px;" />
    ${avisoFrete ? `<p style="margin:0 0 12px 0; color:#b71c1c; font-size:0.92rem;">${avisoFrete}</p>` : '<div style="height:10px;"></div>'}
    <button id="btn-finalizar" class="btn-comprar" type="button" style="width:100%; margin:0;">Finalizar Compra</button>
  `;

  const cepInput = aside.querySelector('#cep-input');
  const btnFinalizar = aside.querySelector('#btn-finalizar');

  cepInput?.addEventListener('input', () => {
    const digits = (cepInput.value || '').replace(/\D/g, '');
    if (digits.length === 8) {
      calcularFretePorCep(cepInput.value, itens);
    }
  });

  btnFinalizar?.addEventListener('click', async () => {
    if (!itens.length) return;

    const pedidoAtual = {
      itens,
      subtotal,
      frete: freteAtual,
      total,
      criadoEm: Date.now(),
    };
    localStorage.setItem('last_order', JSON.stringify(pedidoAtual));

    await iniciarPagamentoMP(itens, usuarioId || 'anonimo');
  });

  container.appendChild(aside);
}

function renderCarrinho(avisoFrete = '') {
  const root = document.getElementById('cart-content');
  if (!root) return;

  const itens = lerCarrinho();
  root.innerHTML = '';

  if (!itens.length) {
    renderCarrinhoVazio(root);
    return;
  }

  const layout = document.createElement('section');
  layout.style.display = 'grid';
  layout.style.gridTemplateColumns = 'minmax(0, 1fr) 340px';
  layout.style.gap = '24px';
  layout.style.alignItems = 'start';

  const lista = document.createElement('div');
  itens.forEach((item) => {
    lista.appendChild(criarItemCard(item));
  });

  layout.appendChild(lista);
  renderResumo(layout, itens, avisoFrete);

  root.appendChild(layout);

  // Responsividade simples sem CSS global novo.
  if (window.innerWidth <= 900) {
    layout.style.gridTemplateColumns = '1fr';
  }
}

window.addEventListener('resize', () => {
  renderCarrinho();
});

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    usuarioId = user?.uid || null;
  });

  // Se voltar do MP com aprovado, mantém histórico local e limpa carrinho.
  if (getAprovadoByQuery()) {
    localStorage.removeItem(CART_KEY);
  }

  renderCarrinho();
});
