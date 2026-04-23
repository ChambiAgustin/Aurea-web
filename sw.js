/* =============================================
   ÁUREA ELIZABETH — Service Worker
   Estrategia:
   - Assets estáticos (HTML/CSS/JS/fonts/logo): Cache-First
   - Supabase API (datos de productos/config):   Network-First con fallback
   ============================================= */

const CACHE_NAME     = 'aurea-v1';
const RUNTIME_CACHE  = 'aurea-runtime-v1';

/* Assets que se pre-cachean en el install */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/catalogo.html',
  '/carrito.html',
  '/style.css',
  '/admin.css',
  '/site.webmanifest',
  '/logo.jpeg',
  '/js/supabase-client.js',
  '/js/cart.js',
  '/js/index.js',
  '/js/catalogo.js',
  '/js/carrito.js',
];

/* ── INSTALL: pre-cachear assets estáticos ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())   /* Activa inmediatamente sin esperar que se cierren los tabs */
  );
});

/* ── ACTIVATE: limpiar caches viejas ── */
self.addEventListener('activate', event => {
  const VALID_CACHES = [CACHE_NAME, RUNTIME_CACHE];

  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => !VALID_CACHES.includes(name))
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())  /* Toma control de todos los tabs sin reload */
  );
});

/* ── FETCH: lógica de respuesta ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* ── 1. Supabase API: Network-First ──
     Intenta la red primero; si falla, sirve desde cache.
     No queremos datos stale de productos/stock. */
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* ── 2. Google Fonts: Cache-First ──
     Las fuentes no cambian; guardarlas en runtime cache. */
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  /* ── 3. Ionicons CDN: Cache-First ── */
  if (url.hostname.includes('unpkg.com') || url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  /* ── 4. Assets estáticos propios: Cache-First ── */
  if (request.method === 'GET') {
    event.respondWith(cacheFirst(request, CACHE_NAME));
  }
});

/* ══════════════════════════════════════════
   ESTRATEGIAS
   ══════════════════════════════════════════ */

/**
 * Cache-First: sirve desde cache si existe, si no, fetch + guarda en cache.
 * Ideal para assets estáticos que no cambian frecuentemente.
 */
async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    /* Solo cacheamos respuestas válidas (no errores) */
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_err) {
    /* Sin red y sin cache: devolvemos página offline si es navegación */
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('', { status: 408 });
  }
}

/**
 * Network-First: intenta la red, con timeout de 4 segundos.
 * Si falla o tarda demasiado, sirve desde cache.
 * Ideal para datos dinámicos de Supabase.
 */
async function networkFirst(request) {
  const TIMEOUT_MS = 4000;

  const networkPromise = fetch(request.clone())
    .then(response => {
      if (response && response.status === 200) {
        caches.open(RUNTIME_CACHE)
          .then(cache => cache.put(request, response.clone()));
      }
      return response;
    });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Network timeout')), TIMEOUT_MS)
  );

  try {
    return await Promise.race([networkPromise, timeoutPromise]);
  } catch (_err) {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
