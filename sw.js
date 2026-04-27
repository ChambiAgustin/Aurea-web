/* =============================================
   ÁUREA ELIZABETH — Service Worker v4
   Estrategia:
   - HTML / CSS / JS propios:    Network-First (siempre frescos)
   - Imágenes propias:           Cache-First   (pesadas, cambian poco)
   - Supabase API:               Network-First con fallback
   - Google Fonts / CDN:         Cache-First   (inmutables)
   ============================================= */

const CACHE_NAME    = 'aurea-v4';
const RUNTIME_CACHE = 'aurea-runtime-v4';

/* Solo pre-cacheamos assets que NO cambian con cada deploy */
const PRECACHE_ASSETS = [
  '/logo.jpeg',
  '/site.webmanifest',
];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpiar caches viejas ── */
self.addEventListener('activate', event => {
  const VALID = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => !VALID.includes(n)).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  /* 1. Supabase API: Network-First */
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* 2. Fonts / CDN externos: Cache-First (nunca cambian) */
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  /* 3. Assets propios del sitio */
  if (url.origin === self.location.origin) {
    const isImage = /\.(jpe?g|png|webp|gif|svg|ico)$/i.test(url.pathname);

    if (isImage) {
      /* Imágenes: Cache-First — son pesadas y cambian raramente */
      event.respondWith(cacheFirst(request, CACHE_NAME));
    } else {
      /* HTML, CSS, JS, manifest: Network-First — deben estar siempre actualizados */
      event.respondWith(networkFirst(request));
    }
  }
});

/* ══════════════════════════════════════════
   ESTRATEGIAS
   ══════════════════════════════════════════ */

async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_err) {
    if (request.mode === 'navigate') return caches.match('/index.html');
    return new Response('', { status: 408 });
  }
}

async function networkFirst(request) {
  const TIMEOUT_MS = 5000;

  const networkPromise = fetch(request.clone())
    .then(response => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        caches.open(RUNTIME_CACHE)
          .then(cache => cache.put(request, response.clone()));
      }
      return response;
    });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
  );

  try {
    return await Promise.race([networkPromise, timeoutPromise]);
  } catch (_err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('/index.html');
    return new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
