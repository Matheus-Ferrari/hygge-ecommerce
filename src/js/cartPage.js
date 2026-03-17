
import { obterCalculoFrete } from './checkoutService.js';
import { validarCupom, aplicarBeneficioCupom } from '../firebase/couponService.js';
import { getProducts } from '../firebase/productService.js';

const CART_KEY = 'cart';
const LEGACY_CART_KEY = 'carrinho';
const CHECKOUT_DRAFT_KEY = 'checkout_draft';

const CART_IMAGE_FALLBACK = 'src/img/logo.png';

let freteAtual = 0;
let freteOriginal = 0;
let cupomAplicado = null;
let cupomResultado = null;
let cepAtual = '';
let mensagemFrete = '';
let freteOpcoes = [];
let freteSelecionadoKey = '';

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

function selecionarFrete(opcao) {
  if (!opcao) return;
  freteSelecionadoKey = getFreteKey(opcao);
  freteAtual = Number(opcao.valor || 0);
  freteOriginal = freteAtual;
  mensagemFrete = opcao.prazo
    ? `${opcao.nome}: ${formatarPreco(freteAtual)} (${opcao.prazo})`
    : `${opcao.nome}: ${formatarPreco(freteAtual)}`;
}

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function formatarCep(cep) {
  const digits = somenteDigitos(cep).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizarItem(item) {
  const imagemOriginal = String(item?.imagem || '').trim();
  return {
    id: String(item?.id || ''),
    nome: String(item?.nome || 'Produto'),
    descricao: String(item?.descricao || 'Jogo de cartas Hygge Games.'),
    preco: Number(item?.preco) || 0,
    imagem: imagemOriginal || CART_IMAGE_FALLBACK,
    quantidade: Math.max(1, Number(item?.quantidade || 1)),
  };
}

function lerCarrinho() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (Array.isArray(parsed)) {
      const normalizado = parsed.map((item) => {
        const normalizado = normalizarItem(item);
        return normalizado;
      });
      localStorage.setItem(CART_KEY, JSON.stringify(normalizado));
      return normalizado;
    }

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
  document.dispatchEvent(new CustomEvent('cart:updated'));
}

function carregarEstadoDraft() {
  try {
    const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : null;
    if (!draft) return;

    freteAtual = Number(draft.frete || 0);
    freteOriginal = Number(draft.freteOriginal || draft.frete || 0);
    freteSelecionadoKey = String(draft.freteOpcaoId || draft.freteMetodo || draft.metodoEntrega || '');
    cupomAplicado = draft.cupom ? String(draft.cupom) : null;
    if (draft.cupomTipo === 'frete_gratis' && cupomAplicado) {
      cupomResultado = { valido: true, tipo: 'frete_gratis', mensagem: 'Cupom aplicado: frete gr\u00e1tis!' };
    }
    cepAtual = formatarCep(draft.cep || '');
  } catch {
    freteAtual = 0;
    freteSelecionadoKey = '';
    cupomAplicado = null;
    cepAtual = '';
  }
}

function removerItem(id) {
  const itens = lerCarrinho().filter((item) => item.id !== id);
  salvarCarrinho(itens);
  renderCarrinho();
}

function atualizarQuantidade(id, quantidade) {
  const qtd = Math.max(1, Math.floor(Number(quantidade || 1)));
  const itens = lerCarrinho().map((item) => (item.id === id ? { ...item, quantidade: qtd } : item));
  salvarCarrinho(itens);
  renderCarrinho();
}

function alterarQuantidade(id, delta) {
  const item = lerCarrinho().find((cartItem) => cartItem.id === id);
  if (!item) return;
  atualizarQuantidade(id, Number(item.quantidade || 1) + delta);
}

function calcularSubtotal(itens) {
  return itens.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
}

function getCupomDesconto(subtotal) {
  if (!cupomAplicado) return 0;
  if (cupomResultado?.valido && cupomResultado.tipo === 'desconto_percentual') {
    return subtotal * (Number(cupomResultado.valor) || 0);
  }
  return 0;
}

function getFreteComCupom() {
  if (cupomResultado?.valido && cupomResultado.tipo === 'frete_gratis') return 0;
  return freteAtual;
}

function renderCarrinhoVazio(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'cart-empty';

  wrapper.innerHTML = `
    <p class="cart-empty__title">Seu carrinho está vazio</p>
    <a href="/todos-os-jogos" class="btn-comprar" style="display:inline-block;">Ver produtos</a>
  `;

  container.appendChild(wrapper);
}

function criarItemCard(item) {
  const subtotal = item.preco * item.quantidade;

  const card = document.createElement('article');
  card.className = 'cart-item-card produto-card';

  card.innerHTML = `
    <div class="cart-item-card__imageWrap produto-img-bg">
      <img src="${item.imagem}" alt="${item.nome}" class="produto-img cart-item-card__image" onerror="this.src='src/img/logo.png'; this.style.objectFit='contain';" />
    </div>

    <div class="cart-item-card__info">
      <h3 class="product-card__title cart-item-card__title">${item.nome}</h3>
      <p class="cart-item-card__description">${item.descricao}</p>
    </div>

    <div class="cart-item-card__qty" aria-label="Controle de quantidade">
      <button class="cart-item-card__qtyBtn" type="button" aria-label="Diminuir quantidade">-</button>
      <span class="cart-item-card__qtyValue">${item.quantidade}</span>
      <button class="cart-item-card__qtyBtn" type="button" aria-label="Aumentar quantidade">+</button>
    </div>

    <div class="cart-item-card__price">${formatarPreco(subtotal)}</div>

    <button class="cart-item-card__remove" type="button" aria-label="Remover item">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  `;

  const qtyBtns = card.querySelectorAll('.cart-item-card__qtyBtn');
  const removerBtn = card.querySelector('.cart-item-card__remove');

  qtyBtns[0]?.addEventListener('click', () => alterarQuantidade(item.id, -1));
  qtyBtns[1]?.addEventListener('click', () => alterarQuantidade(item.id, 1));

  removerBtn?.addEventListener('click', () => {
    removerItem(item.id);
  });

  return card;
}

async function calcularFretePorCep(cep, itens) {
  const somente = somenteDigitos(cep);
  if (somente.length !== 8) {
    mensagemFrete = 'Informe um CEP válido com 8 dígitos.';
    freteOpcoes = [];
    renderCarrinho();
    return;
  }

  const resultado = await obterCalculoFrete(somente, itens);
  if (!Array.isArray(resultado)) {
    freteAtual = 0;
    freteOpcoes = [];
    mensagemFrete = resultado?.mensagem || 'Não foi possível calcular o frete agora.';
    renderCarrinho();
    return;
  }

  freteOpcoes = normalizarOpcoesFrete(resultado);

  if (!freteOpcoes.length) {
    freteAtual = 0;
    mensagemFrete = 'Nenhuma opção de frete disponível para este CEP.';
    renderCarrinho();
    return;
  }

  const preferida = freteSelecionadoKey
    ? freteOpcoes.find((o) => getFreteKey(o) === freteSelecionadoKey)
    : null;
  const maisBarata = freteOpcoes.reduce((best, cur) => (!best || cur.valor < best.valor ? cur : best), null);
  selecionarFrete(preferida || maisBarata);

  renderCarrinho();
}

function salvarDraftCheckout(payload) {
  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(payload));
}

function renderCupom(listaColuna, subtotal) {
  const cupomCard = document.createElement('div');
  cupomCard.className = 'cart-coupon produto-card';

  cupomCard.innerHTML = `
    <h3 class="product-card__title cart-coupon__title">Cupom promocional</h3>
    <div class="cart-coupon__row">
      <input id="coupon-input" type="text" placeholder="Insira o código promocional" maxlength="24" />
      <button id="coupon-apply" class="btn-comprar" type="button">Aplicar</button>
    </div>
    <p id="coupon-feedback" class="cart-coupon__feedback"></p>
    <div id="coupon-applied"></div>
  `;

  const input = cupomCard.querySelector('#coupon-input');
  const btn = cupomCard.querySelector('#coupon-apply');
  const feedback = cupomCard.querySelector('#coupon-feedback');
  const applied = cupomCard.querySelector('#coupon-applied');

  if (input && cupomAplicado) input.value = cupomAplicado;

  const desconto = getCupomDesconto(subtotal);
  const isFreteGratisCupom = cupomResultado?.valido && cupomResultado.tipo === 'frete_gratis';
  if ((desconto > 0 || isFreteGratisCupom) && applied) {
    const label = isFreteGratisCupom
      ? `Cupom aplicado: frete grátis!`
      : `Cupom aplicado: ${cupomAplicado}`;
    applied.innerHTML = `
      <div class="cart-coupon__applied">
        <span>${label}</span>
        <button class="cart-coupon__remove" type="button">Remover</button>
      </div>
    `;

    const removerCupom = applied.querySelector('.cart-coupon__remove');
    removerCupom?.addEventListener('click', () => {
      cupomAplicado = null;
      cupomResultado = null;
      freteAtual = freteOriginal;
      renderCarrinho();
    });
  }

  btn?.addEventListener('click', async () => {
    const codigo = String(input?.value || '').trim();

    if (!codigo) {
      cupomAplicado = null;
      cupomResultado = null;
      if (feedback) feedback.textContent = 'Informe um código para aplicar.';
      freteAtual = freteOriginal;
      renderCarrinho();
      return;
    }

    // Buscar no Firestore
    if (btn) btn.disabled = true;
    if (btn) btn.textContent = 'Validando...';
    try {
      const resultado = await validarCupom(codigo);
      if (resultado.valido) {
        cupomAplicado = codigo;
        cupomResultado = resultado;
        if (feedback) {
          feedback.textContent = resultado.mensagem;
          feedback.style.color = '#2e7d32';
        }
      } else {
        cupomAplicado = null;
        cupomResultado = null;
        freteAtual = freteOriginal;
        if (feedback) {
          feedback.textContent = resultado.mensagem;
          feedback.style.color = '#c62828';
        }
      }
    } catch {
      cupomAplicado = null;
      cupomResultado = null;
      freteAtual = freteOriginal;
      if (feedback) {
        feedback.textContent = 'Erro ao validar cupom. Tente novamente.';
        feedback.style.color = '#c62828';
      }
    } finally {
      if (btn) btn.disabled = false;
      if (btn) btn.textContent = 'Aplicar';
    }

    renderCarrinho();
  });

  listaColuna.appendChild(cupomCard);
}

function renderResumo(container, itens) {
  const subtotal = calcularSubtotal(itens);
  const desconto = getCupomDesconto(subtotal);
  const freteEfetivo = getFreteComCupom();
  const isFreteGratis = cupomResultado?.valido && cupomResultado.tipo === 'frete_gratis';
  const total = Math.max(0, subtotal + freteEfetivo - desconto);

  const freteCardsHtml = freteOpcoes.length
    ? `
      <div class="delivery-options" id="cart-delivery-options" aria-label="Opções de frete">
        ${freteOpcoes
          .map((o) => {
            const key = getFreteKey(o);
            const checked = key && key === freteSelecionadoKey;
            const subtitle = o.prazo ? o.prazo : 'Prazo indisponível';
            return `
              <label class="delivery-card${checked ? ' delivery-card--selected' : ''}">
                <input type="radio" name="cart_delivery_method" value="${String(key).replace(/"/g, '&quot;')}" ${checked ? 'checked' : ''} />
                <span class="delivery-card__title">${o.nome}</span>
                <span class="delivery-card__price">${formatarPreco(o.valor)}</span>
                <span class="delivery-card__subtitle">${subtitle}</span>
              </label>
            `.trim();
          })
          .join('')}
      </div>
    `
    : '';

  const aside = document.createElement('aside');
  aside.className = 'cart-summary produto-card';

  aside.innerHTML = `
    <h3 class="product-card__title cart-summary__title">Resumo do pedido</h3>
    <div class="cart-summary__line"><span>Subtotal</span><strong>${formatarPreco(subtotal)}</strong></div>
    <div class="cart-summary__line"><span>Frete</span><strong>${isFreteGratis ? '<span style="color:#2e7d32">Gr\u00e1tis</span>' : (freteEfetivo ? formatarPreco(freteEfetivo) : '--')}</strong></div>
    <label for="cep-input" class="cart-summary__label">CEP</label>
    <div class="cart-summary__shippingRow">
      <input id="cep-input" type="text" maxlength="9" placeholder="00000-000" class="cart-summary__cep" value="${cepAtual}" />
      <button id="btn-calcular-frete" class="btn-comprar" type="button">Calcular frete</button>
    </div>
    <p class="cart-summary__shippingResult">${mensagemFrete || ''}</p>
    ${freteCardsHtml}
    ${desconto > 0 ? `<div class="cart-summary__line"><span>Código promocional</span><strong>- ${formatarPreco(desconto)}</strong></div>` : ''}
    <div class="cart-summary__line cart-summary__line--total"><span>Total final</span><strong>${formatarPreco(total)}</strong></div>
    <button id="btn-finalizar" class="btn-comprar cart-summary__button" type="button">Finalizar compra</button>
  `;

  const cepInput = aside.querySelector('#cep-input');
  const btnFrete = aside.querySelector('#btn-calcular-frete');
  const btnFinalizar = aside.querySelector('#btn-finalizar');

  cepInput?.addEventListener('input', () => {
    cepInput.value = formatarCep(cepInput.value);
    cepAtual = cepInput.value;
  });

  btnFrete?.addEventListener('click', async () => {
    await calcularFretePorCep(cepInput?.value || '', itens);
  });

  const freteRadios = aside.querySelectorAll('input[name="cart_delivery_method"]');
  freteRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      const key = String(radio.value || '');
      const selected = freteOpcoes.find((o) => getFreteKey(o) === key);
      if (!selected) return;
      selecionarFrete(selected);
      renderCarrinho();
    });
  });

  btnFinalizar?.addEventListener('click', () => {
    if (!itens.length) return;

    const opcaoSelecionada = freteOpcoes.find((o) => getFreteKey(o) === freteSelecionadoKey) || null;

    salvarDraftCheckout({
      itens,
      subtotal,
      frete: freteEfetivo,
      freteOriginal: freteAtual,
      freteOpcaoId: opcaoSelecionada ? getFreteKey(opcaoSelecionada) : null,
      freteMetodo: opcaoSelecionada?.nome || null,
      fretePrazo: opcaoSelecionada?.prazo || null,
      desconto,
      total,
      cupom: cupomAplicado || null,
      cupomTipo: cupomResultado?.tipo || null,
      cep: cepAtual,
      criadoEm: Date.now(),
    });

    window.location.href = '/checkout';
  });

  container.appendChild(aside);
}

function renderCarrinho() {
  const root = document.getElementById('cart-content');
  if (!root) return;

  const itens = lerCarrinho();
  root.innerHTML = '';

  if (!itens.length) {
    renderCarrinhoVazio(root);
    return;
  }

  const layout = document.createElement('section');
  layout.className = 'cart-layout';

  const listaColuna = document.createElement('div');
  listaColuna.className = 'cart-layout__left';

  const topActions = document.createElement('div');
  topActions.className = 'cart-top-actions';
  topActions.innerHTML = '<a href="/" class="btn-mostrar-jogos cart-continue-btn">Continuar navegando</a>';
  listaColuna.appendChild(topActions);

  itens.forEach((item) => {
    listaColuna.appendChild(criarItemCard(item));
  });

  renderCupom(listaColuna, calcularSubtotal(itens));
  layout.appendChild(listaColuna);
  renderResumo(layout, itens);

  root.appendChild(layout);
}

async function sincronizarPrecosFirestore() {
  try {
    const produtos = await getProducts();
    if (!Array.isArray(produtos) || !produtos.length) return;

    const itens = lerCarrinho();
    if (!itens.length) return;

    let alterou = false;
    const atualizados = itens.map((item) => {
      const firestoreItem = produtos.find((p) => p.id === item.id);
      if (firestoreItem && Number(firestoreItem.preco) > 0 && Number(firestoreItem.preco) !== Number(item.preco)) {
        alterou = true;
        return { ...item, preco: Number(firestoreItem.preco) };
      }
      return item;
    });

    if (alterou) {
      salvarCarrinho(atualizados);
      renderCarrinho();
    }
  } catch (err) {
    console.warn('Não foi possível sincronizar preços do carrinho:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregarEstadoDraft();
  renderCarrinho();
  sincronizarPrecosFirestore();
});
