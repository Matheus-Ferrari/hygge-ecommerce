import { trackPurchase } from './metaPixel.js';

(function () {
  const summaryEl = document.getElementById('order-summary');
  const raw = localStorage.getItem('last_order');

  // Limpa o carrinho ao chegar na página de sucesso.
  localStorage.removeItem('cart');
  localStorage.removeItem('carrinho');
  localStorage.removeItem('checkout_draft');

  if (!raw || !summaryEl) return;

  try {
    const order = JSON.parse(raw);
    const itens = Array.isArray(order?.itens) ? order.itens : [];
    const subtotal = Number(order?.subtotal || 0);
    const frete = Number(order?.frete || 0);
    const total = Number(order?.total || 0);
    const metodoEntrega = String(order?.metodoEntrega || '').trim();
    const freteMetodo = String(order?.freteMetodo || '').trim();

    const format = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    summaryEl.textContent = '';

    itens.forEach((item) => {
      const nome = String(item?.nome || 'Produto');
      const imgSrc = String(item?.imagem || '/img/logopreta.png');
      const qtd = Number(item?.quantidade ?? 1);
      const preco = Number(item?.preco ?? 0);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #e2dcd6;';

      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = nome;
      img.style.cssText = 'width:58px; height:58px; object-fit:cover; border-radius:10px; flex-shrink:0; background:#ece7e0;';
      img.onerror = function () { this.src = '/img/logopreta.png'; };

      const info = document.createElement('div');
      info.style.cssText = 'flex:1; min-width:0;';

      const pNome = document.createElement('p');
      pNome.style.cssText = 'margin:0 0 3px 0; font-weight:600; font-size:0.97rem; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
      pNome.textContent = nome;

      const pDetail = document.createElement('p');
      pDetail.style.cssText = 'margin:0; color:#666; font-size:0.88rem;';
      pDetail.textContent = `Qtd: ${qtd}  ·  ${format(preco)}`;

      info.appendChild(pNome);
      info.appendChild(pDetail);
      row.appendChild(img);
      row.appendChild(info);
      summaryEl.appendChild(row);
    });

    const totaisDiv = document.createElement('div');
    totaisDiv.style.cssText = 'margin-top:12px; display:flex; flex-direction:column; gap:4px;';

    const mkLine = (text, value, extra) => {
      const p = document.createElement('p');
      p.style.cssText = extra || 'margin:0; font-size:0.95rem;';
      p.append(text + ' ');
      const strong = document.createElement('strong');
      strong.textContent = value;
      p.appendChild(strong);
      return p;
    };

    totaisDiv.appendChild(mkLine('Subtotal:', format(subtotal)));
    totaisDiv.appendChild(mkLine('Frete:', frete > 0 ? format(frete) : 'Grátis'));

    if (freteMetodo || metodoEntrega) {
      const entregaLabel = (metodoEntrega === 'retirada') ? 'Retirada' : (freteMetodo || metodoEntrega);
      totaisDiv.appendChild(mkLine('Entrega:', entregaLabel));
    }

    totaisDiv.appendChild(mkLine('Total:', format(total), 'margin:4px 0 0 0; font-size:1.05rem; border-top:1px solid #d9d3cc; padding-top:8px;'));
    summaryEl.appendChild(totaisDiv);
  } catch {
    // Mantém fallback padrão.
  }
})();

try {
  const raw = localStorage.getItem('last_order');
  if (raw) {
    const order = JSON.parse(raw);
    const itens = Array.isArray(order?.itens) ? order.itens : [];
    trackPurchase({
      contentIds: itens.map((i) => i.id),
      value: Number(order?.total || 0),
      currency: 'BRL',
      orderId: order?.userId || '',
    }, order?.fbEventId || undefined);
  }
} catch { /* ignore */ }
