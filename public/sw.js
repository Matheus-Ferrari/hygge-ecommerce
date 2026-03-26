// Service Worker — cache de imagens Firebase Storage (stale-while-revalidate)
const CACHE = 'hygge-img-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  // Remove versões antigas do cache
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.includes('firebasestorage.googleapis.com')) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);

    // Stale-while-revalidate: entrega o cache imediatamente e atualiza em background
    if (cached) {
      fetch(e.request)
        .then(r => { if (r.ok) cache.put(e.request, r.clone()); })
        .catch(() => {});
      return cached;
    }

    // Sem cache: busca da rede e armazena
    try {
      const resp = await fetch(e.request);
      if (resp.ok) cache.put(e.request, resp.clone());
      return resp;
    } catch {
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});
