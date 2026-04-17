// =====================================================================
// PENDENTE.HTML — Monitoramento automático do Pix com Mercado Pago
// =====================================================================
(function () {
  'use strict';

  const STATUS_API = 'https://us-central1-e-commerce-hygge.cloudfunctions.net/consultarStatusPedido';
  const REDIRECT_APPROVED = '/obrigado';
  const REDIRECT_REJECTED = '/carrinho';
  const POLL_INTERVAL_MS = 4000;   // Consulta a cada 4 segundos
  const MAX_POLLS = 150;            // Máximo ~10 minutos de monitoramento

  let pollCount = 0;
  let pollTimer = null;
  let redirecting = false;

  // --- Elementos de UI ---
  const titleEl    = document.getElementById('status-title');
  const subtitleEl = document.getElementById('status-subtitle');
  const iconEl     = document.getElementById('status-icon');
  const progressEl = document.getElementById('polling-progress');
  const barEl      = document.getElementById('polling-bar');
  const msgEl      = document.getElementById('auto-redirect-msg');
  const summaryEl  = document.getElementById('order-summary');

  // --- Extrair parâmetros da URL (Mercado Pago envia ao redirecionar) ---
  const params = new URLSearchParams(window.location.search);
  const urlExternalRef = params.get('external_reference') || '';
  const urlPaymentId   = params.get('payment_id') || params.get('collection_id') || '';
  const urlStatus      = params.get('status') || params.get('collection_status') || '';

  // --- Obter external_reference também do last_order (fallback) ---
  let lastOrder = null;
  try {
    const raw = localStorage.getItem('last_order');
    if (raw) lastOrder = JSON.parse(raw);
  } catch { /* ignore */ }

  const externalRef = urlExternalRef
    || String(lastOrder?.userId || lastOrder?.ownerId || '')
    || '';
  const paymentId = urlPaymentId || '';

  // --- Renderizar resumo do pedido (do localStorage) ---
  function renderSummary(order) {
    if (!summaryEl) return;
    if (!order) {
      summaryEl.innerHTML = '<p style="margin:0; color:#888;">Resumo do pedido indisponível.</p>';
      return;
    }

    const itens    = Array.isArray(order?.itens) ? order.itens : [];
    const subtotal = Number(order?.subtotal || 0);
    const frete    = Number(order?.frete || 0);
    const total    = Number(order?.total || 0);
    const metodo   = String(order?.metodoEntrega || order?.freteMetodo || '').trim();
    const fmt      = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    summaryEl.textContent = '';

    itens.forEach((item) => {
      const nome   = String(item?.nome || 'Produto');
      const imgSrc = String(item?.imagem || '/img/logopreta.png');
      const qtd    = Number(item?.quantidade ?? 1);
      const preco  = Number(item?.preco ?? 0);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #e2dcd6;';

      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = nome;
      img.style.cssText = 'width:52px;height:52px;object-fit:cover;border-radius:10px;flex-shrink:0;background:#ece7e0;';
      img.onerror = function () { this.src = '/img/logopreta.png'; };

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';

      const pNome = document.createElement('p');
      pNome.style.cssText = 'margin:0 0 3px 0;font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      pNome.textContent = nome;

      const pDetail = document.createElement('p');
      pDetail.style.cssText = 'margin:0;color:#666;font-size:0.87rem;';
      pDetail.textContent = `Qtd: ${qtd}  ·  ${fmt(preco)}`;

      info.appendChild(pNome);
      info.appendChild(pDetail);
      row.appendChild(img);
      row.appendChild(info);
      summaryEl.appendChild(row);
    });

    if (!itens.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'margin:0;color:#888;';
      empty.textContent = 'Nenhum item registrado.';
      summaryEl.appendChild(empty);
    }

    const totaisDiv = document.createElement('div');
    totaisDiv.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;gap:4px;';

    const mkLine = (text, value, extra) => {
      const p = document.createElement('p');
      p.style.cssText = extra || 'margin:0;font-size:0.93rem;';
      p.append(text + ' ');
      const strong = document.createElement('strong');
      strong.textContent = value;
      p.appendChild(strong);
      return p;
    };

    totaisDiv.appendChild(mkLine('Subtotal:', fmt(subtotal)));
    totaisDiv.appendChild(mkLine('Frete:', frete > 0 ? fmt(frete) : 'Grátis'));

    if (metodo) {
      totaisDiv.appendChild(mkLine('Entrega:', metodo === 'retirada' ? 'Retirada' : metodo));
    }

    totaisDiv.appendChild(mkLine('Total:', fmt(total), 'margin:4px 0 0 0;font-size:1.03rem;border-top:1px solid #d9d3cc;padding-top:8px;'));
    summaryEl.appendChild(totaisDiv);
  }

  // --- Atualizar UI de status ---
  function setStatusUI(state) {
    if (!titleEl || !subtitleEl || !iconEl) return;
    const states = {
      pending:  { icon: '⏳', bg: '#e8a400', title: 'Aguardando pagamento',      subtitle: 'Verifique se o Pix foi concluído no aplicativo do seu banco.' },
      checking: { icon: '🔄', bg: '#1565c0', title: 'Verificando pagamento...', subtitle: 'Estamos confirmando o seu pagamento. Aguarde.' },
      approved: { icon: '✓',  bg: '#2e7d32', title: 'Pagamento aprovado!',       subtitle: 'Redirecionando para a confirmação do pedido...' },
      rejected: { icon: '✗',  bg: '#c62828', title: 'Pagamento não aprovado',    subtitle: 'O pagamento foi recusado ou cancelado.' },
      timeout:  { icon: '⌛', bg: '#616161', title: 'Tempo esgotado',            subtitle: 'Não conseguimos confirmar o pagamento automaticamente. Verifique em Meus Pedidos.' },
    };
    const s = states[state] || states.pending;
    iconEl.textContent = s.icon;
    iconEl.style.background = s.bg;
    titleEl.textContent = s.title;
    subtitleEl.textContent = s.subtitle;
  }

  // --- Animar barra de progresso de forma cíclica ---
  function animateProgress() {
    if (!progressEl) return;
    let p = 0;
    const step = () => {
      if (redirecting) return;
      p = (p + 2) % 110;
      progressEl.style.width = Math.min(p, 100) + '%';
      requestAnimationFrame(() => setTimeout(step, 50));
    };
    step();
  }

  // --- Redirecionar para página de obrigado ---
  function redirectApproved() {
    redirecting = true;
    clearTimeout(pollTimer);
    setStatusUI('approved');
    if (progressEl) progressEl.style.width = '100%';
    if (msgEl) {
      msgEl.style.background = '#e8f5e9';
      msgEl.style.borderColor = '#a5d6a7';
      msgEl.style.color = '#2e7d32';
      msgEl.innerHTML = '✅ <strong>Pagamento confirmado!</strong> Redirecionando...';
    }
    setTimeout(() => { window.location.href = REDIRECT_APPROVED; }, 1800);
  }

  // --- Pagamento recusado ---
  function redirectRejected(msg) {
    redirecting = true;
    clearTimeout(pollTimer);
    setStatusUI('rejected');
    if (barEl) barEl.style.display = 'none';
    if (msgEl) {
      msgEl.style.background = '#ffebee';
      msgEl.style.borderColor = '#ef9a9a';
      msgEl.style.color = '#c62828';
      msgEl.innerHTML = `❌ <strong>${msg || 'Pagamento recusado.'}</strong><br><span style="font-size:0.92rem;">Você pode tentar novamente com outro método de pagamento.</span>
        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <a href="/carrinho" class="btn-comprar" style="margin:0; font-size:0.95rem;">Tentar novamente</a>
          <a href="/todos-os-jogos" class="btn-mostrar-jogos" style="font-size:0.95rem;">Continuar comprando</a>
        </div>`;
    }
  }

  // --- Consultar status no backend ---
  async function checkStatus() {
    if (redirecting) return;

    pollCount++;
    setStatusUI(pollCount === 1 ? 'pending' : 'checking');

    if (pollCount > MAX_POLLS) {
      setStatusUI('timeout');
      if (barEl) barEl.style.display = 'none';
      if (msgEl) {
        msgEl.style.background = '#f5f5f5';
        msgEl.style.borderColor = '#bdbdbd';
        msgEl.style.color = '#555';
        msgEl.textContent = '⌛ Monitoramento encerrado. Verifique o status em Meus Pedidos.';
      }
      return;
    }

    if (pollCount === 1 && urlStatus === 'approved') {
      redirectApproved();
      return;
    }

    if (!externalRef && !paymentId) {
      console.warn('[Pendente] external_reference e payment_id ausentes. Aguardando...');
      pollTimer = setTimeout(checkStatus, POLL_INTERVAL_MS);
      return;
    }

    try {
      const qp = new URLSearchParams();
      if (externalRef) qp.set('external_reference', externalRef);
      if (paymentId)   qp.set('payment_id', paymentId);

      const resp = await fetch(`${STATUS_API}?${qp.toString()}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const result = await resp.json();
      console.log('[Pendente] Status consultado:', result);

      if (result.approved === true || result.status === 'approved') {
        redirectApproved();
        return;
      }

      const finalSt = String(result.status || '').toLowerCase();
      if (finalSt === 'rejected' || finalSt === 'cancelled' || finalSt === 'refunded') {
        redirectRejected('O pagamento foi recusado ou cancelado.');
        return;
      }
    } catch (err) {
      console.warn('[Pendente] Erro ao consultar status:', err.message);
    }

    pollTimer = setTimeout(checkStatus, POLL_INTERVAL_MS);
  }

  // --- Inicialização ---
  renderSummary(lastOrder);
  setStatusUI('pending');
  animateProgress();

  // Inicia polling após 2 segundos (dá tempo do webhook chegar)
  pollTimer = setTimeout(checkStatus, 2000);
})();
