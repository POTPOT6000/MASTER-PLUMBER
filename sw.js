/* ═══════════════════════════════════════════════════════════════════
   PH ENGINEERING BOARD REVIEWER — SERVICE WORKER
   Caches HTML, JS, CSS, fonts, and /img/ folder for offline use.
   Strategy: Cache-first for static assets, Network-first for API calls.
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME   = 'ph-reviewer-v1';
const ASSETS_CACHE = 'ph-reviewer-assets-v1';
const IMG_CACHE    = 'ph-reviewer-img-v1';

/* Core files to pre-cache on install */
const PRECACHE_URLS = [
  './MPLE61_emotional.html',
  './manifest.json',
  /* Question bank JS modules — add your files here */
  './arithmetic.js',
  './code.js',
  './design.js',
  './practical.js',
  /* Fonts (cached from Google Fonts CDN on first load) */
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Mono:wght@400;700&display=swap',
];

/* ── INSTALL ── Pre-cache all core assets ──────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching core assets');
        /* Use individual adds so one failure doesn't break the whole install */
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(e => console.warn('[SW] Skipped:', url, e.message))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── Clean up old caches ───────────────────────────────── */
self.addEventListener('activate', event => {
  const validCaches = [CACHE_NAME, ASSETS_CACHE, IMG_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ── Route requests by strategy ───────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET and cross-origin API calls (Anthropic API, etc.) */
  if(request.method !== 'GET') return;
  if(url.hostname === 'api.anthropic.com') return;

  /* ① Images — Cache-first, then network, then fallback ─────────── */
  if(
    request.url.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i) ||
    url.pathname.startsWith('/img/')
  ){
    event.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if(cached) return cached;
          return fetch(request)
            .then(response => {
              if(response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f1e35"/><text x="50" y="55" text-anchor="middle" fill="#3d5472" font-size="12">Image offline</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            ));
        })
      )
    );
    return;
  }

  /* ② Core HTML app — Network-first (get updates), fallback to cache */
  if(
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  ){
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached =>
          cached || caches.match('./MPLE61_emotional.html')
        ))
    );
    return;
  }

  /* ③ JS/CSS/Fonts — Cache-first (static assets don't change often) */
  if(
    request.url.match(/\.(js|css|woff2?|ttf|otf)$/i) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname.includes('unpkg.com')
  ){
    event.respondWith(
      caches.open(ASSETS_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if(cached) return cached;
          return fetch(request).then(response => {
            if(response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  /* ④ Everything else — Network with cache fallback */
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});

/* ── MESSAGE — Force update from app ───────────────────────────────── */
self.addEventListener('message', event => {
  if(event.data === 'SKIP_WAITING') self.skipWaiting();
  if(event.data === 'CLEAR_CACHE'){
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => {
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage('CACHE_CLEARED'))
      );
    });
  }
});
