/**
 * Meta Pixel + helpers de tracking para o e-commerce Hygge Games.
 *
 * O SDK do Meta é carregado dinamicamente e o evento PageView
 * é disparado automaticamente ao importar este módulo.
 *
 * Cada evento gera um event_id (UUID v4) que é retornado para
 * permitir desduplicação com a Conversions API no backend.
 */

const PIXEL_ID = '1398665571980464';

// --- Inicialização do SDK (fbevents.js) ---
(function () {
  if (window.fbq) return;

  const n = (window.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  });
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];

  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const first = document.getElementsByTagName('script')[0];
  first.parentNode.insertBefore(s, first);
})();

window.fbq('init', PIXEL_ID);

// --- Helpers ---

function generateEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para browsers antigos
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function track(eventName, params = {}, eventId) {
  const eid = eventId || generateEventId();
  window.fbq('track', eventName, params, { eventID: eid });
  return eid;
}

// --- PageView automático ---
track('PageView');

// --- Exports para os outros módulos ---

/**
 * Dispara ViewContent na página de produto.
 * @returns {string} event_id gerado
 */
export function trackViewContent({ contentIds, contentName, value, currency = 'BRL' }) {
  return track('ViewContent', {
    content_ids: contentIds,
    content_name: contentName,
    content_type: 'product',
    value,
    currency,
  });
}

/**
 * Dispara AddToCart ao adicionar produto ao carrinho.
 * @returns {string} event_id gerado
 */
export function trackAddToCart({ contentIds, contentName, value, currency = 'BRL' }) {
  return track('AddToCart', {
    content_ids: contentIds,
    content_name: contentName,
    content_type: 'product',
    value,
    currency,
  });
}

/**
 * Dispara InitiateCheckout ao iniciar o fluxo de pagamento.
 * @returns {string} event_id gerado
 */
export function trackInitiateCheckout({ contentIds, numItems, value, currency = 'BRL' }) {
  return track('InitiateCheckout', {
    content_ids: contentIds,
    num_items: numItems,
    value,
    currency,
  });
}

/**
 * Dispara Purchase na página de sucesso.
 * @param {string} [eventId] - event_id pré-gerado para desduplicação com CAPI
 * @returns {string} event_id utilizado
 */
export function trackPurchase({ contentIds, value, currency = 'BRL', orderId }, eventId) {
  return track('Purchase', {
    content_ids: contentIds,
    content_type: 'product',
    value,
    currency,
    order_id: orderId,
  }, eventId);
}

/**
 * Gera um event_id para usar antes do redirect de pagamento.
 * Salvar no localStorage junto com last_order para desduplicação CAPI.
 */
export { generateEventId };
