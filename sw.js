/* ============================================================
   المدير — Service Worker v2.0.0
   PWA: Caching، Offline، Background Sync، Push
   ============================================================ */

'use strict';

const SW_VERSION    = 'almudir-v2.0.0';
const STATIC_CACHE  = `${SW_VERSION}-static`;
const DYNAMIC_CACHE = `${SW_VERSION}-dynamic`;
const API_CACHE     = `${SW_VERSION}-api`;

/* ============================================================
   ASSETS TO PRECACHE
   ============================================================ */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/state.js',
  '/api.js',
  '/utils.js',
  '/app.js',
  '/offline-sync.js',
  '/components/dashboard.js',
  '/components/kanban.js',
  '/components/notes-editor.js',
  '/components/chat.js',
  '/components/calendar.js',
  '/components/pomodoro.js',
  '/components/command-palette.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  /* CDN fallbacks */
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
];

/* ============================================================
   CACHE STRATEGIES
   ============================================================ */
const CACHE_STRATEGIES = {
  /* Network first, fallback to cache */
  networkFirst: ['https://fonts.gstatic.com'],
  /* Cache first, revalidate in background */
  staleWhileRevalidate: [
    'https://cdnjs.cloudflare.com',
    'https://cdn.jsdelivr.net',
    'https://fonts.googleapis.com',
  ],
  /* Cache only */
  cacheOnly: [],
  /* API: network first with short cache */
  api: ['/api/'],
};

/* ============================================================
   INSTALL EVENT
   ============================================================ */
self.addEventListener('install', (event) => {
  console.log(`[SW] 📦 Installing ${SW_VERSION}...`);

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async (cache) => {
        /* Cache each asset individually to handle failures */
        const results = await Promise.allSettled(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache: ${url}`, err.message);
            })
          )
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[SW] ✅ Precached ${succeeded}/${PRECACHE_ASSETS.length} assets`);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Install failed:', err))
  );
});

/* ============================================================
   ACTIVATE EVENT
   ============================================================ */
self.addEventListener('activate', (event) => {
  console.log(`[SW] ⚡ Activating ${SW_VERSION}...`);

  event.waitUntil(
    Promise.all([
      /* Delete old caches */
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key.startsWith('almudir-') &&
              ![STATIC_CACHE, DYNAMIC_CACHE, API_CACHE].includes(key)
            )
            .map(key => {
              console.log(`[SW] 🗑️ Deleting old cache: ${key}`);
              return caches.delete(key);
            })
        )
      ),
      /* Take control immediately */
      self.clients.claim(),
    ]).then(() => {
      console.log(`[SW] ✅ Active and controlling all clients`);
      /* Notify clients of update */
      self.clients.matchAll().then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION })
        );
      });
    })
  );
});

/* ============================================================
   FETCH EVENT
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url         = new URL(request.url);

  /* Skip non-GET for caching (except API) */
  if (request.method !== 'GET' && !url.pathname.startsWith('/api/')) {
    return;
  }

  /* Skip Chrome extensions and devtools */
  if (!url.protocol.startsWith('http')) return;

  /* API requests */
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }

  /* CDN: stale-while-revalidate */
  if (CACHE_STRATEGIES.staleWhileRevalidate.some(o => request.url.includes(o))) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    return;
  }

  /* Fonts: network first */
  if (CACHE_STRATEGIES.networkFirst.some(o => request.url.includes(o))) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  /* App shell: cache first */
  event.respondWith(cacheFirst(request));
});

/* ============================================================
   CACHE STRATEGY: Cache First
   ============================================================ */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    /* Return offline fallback */
    return offlineFallback(request);
  }
}

/* ============================================================
   CACHE STRATEGY: Network First
   ============================================================ */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetchWithTimeout(request, 8000);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? offlineFallback(request);
  }
}

/* ============================================================
   CACHE STRATEGY: Stale While Revalidate
   ============================================================ */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  /* Revalidate in background */
  const revalidate = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => {});

  return cached ?? revalidate;
}

/* ============================================================
   API REQUEST HANDLER
   ============================================================ */
async function handleAPIRequest(request) {
  /* Only cache GET requests */
  if (request.method === 'GET') {
    try {
      const response = await fetchWithTimeout(request, 10000);
      if (response.ok) {
        const cache = await caches.open(API_CACHE);
        /* Short TTL for API responses */
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      /* Return cached API response if available */
      const cached = await caches.match(request);
      if (cached) {
        /* Add header to indicate stale response */
        const headers = new Headers(cached.headers);
        headers.set('X-From-Cache', 'true');
        return new Response(await cached.blob(), {
          status:  cached.status,
          headers,
        });
      }
      return apiErrorResponse();
    }
  }

  /* POST/PUT/DELETE — pass through or queue if offline */
  try {
    return await fetchWithTimeout(request, 15000);
  } catch {
    return apiErrorResponse(503, 'Service Unavailable — You are offline');
  }
}

/* ============================================================
   OFFLINE FALLBACK
   ============================================================ */
function offlineFallback(request) {
  const url = new URL(request.url);

  /* HTML pages → return cached index.html */
  if (request.headers.get('Accept')?.includes('text/html')) {
    return caches.match('/index.html') ??
      new Response(offlineHTML(), {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
  }

  /* Images */
  if (request.destination === 'image') {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="50" x="50" font-size="40" text-anchor="middle">📷</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }

  return new Response('Offline', { status: 503 });
}

/* ============================================================
   API ERROR RESPONSE
   ============================================================ */
function apiErrorResponse(status = 503, message = 'Offline') {
  return new Response(
    JSON.stringify({ error: message, offline: true }),
    {
      status,
      headers: {
        'Content-Type':  'application/json',
        'X-From-Cache':  'false',
        'X-Offline':     'true',
      },
    }
  );
}

/* ============================================================
   FETCH WITH TIMEOUT
   ============================================================ */
function fetchWithTimeout(request, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Request timeout')),
      timeout
    );

    fetch(request).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (error)    => { clearTimeout(timer); reject(error); }
    );
  });
}

/* ============================================================
   OFFLINE HTML PAGE
   ============================================================ */
function offlineHTML() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>المدير — غير متصل</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', system-ui, sans-serif;
      background: #0f0f13;
      color: #e8e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 24px;
    }
    .card {
      max-width: 400px;
      background: #1e1e2a;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 48px 32px;
    }
    .icon { font-size: 4rem; margin-bottom: 16px; }
    h1   { font-size: 1.5rem; font-weight: 800; margin-bottom: 12px; }
    p    { color: #9898b0; font-size: 0.9rem; line-height: 1.7; margin-bottom: 24px; }
    button {
      background: linear-gradient(135deg, #6c63ff, #a855f7);
      color: white;
      border: none;
      border-radius: 12px;
      padding: 12px 32px;
      font-size: 1rem;
      font-family: inherit;
      cursor: pointer;
      font-weight: 700;
    }
    button:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📴</div>
    <h1>أنت غير متصل بالإنترنت</h1>
    <p>
      لا يمكن تحميل تطبيق المدير حالياً.<br/>
      تحقق من اتصالك بالإنترنت وحاول مرة أخرى.
    </p>
    <button onclick="window.location.reload()">
      🔄 إعادة المحاولة
    </button>
  </div>
</body>
</html>`;
}

/* ============================================================
   BACKGROUND SYNC EVENT
   ============================================================ */
self.addEventListener('sync', (event) => {
  console.log(`[SW] 🔄 Background sync: ${event.tag}`);

  if (event.tag === 'almudir-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: 'SYNC_TRIGGER' })
        );
      })
    );
  }
});

/* ============================================================
   PUSH NOTIFICATION EVENT
   ============================================================ */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'المدير', body: event.data.text() };
  }

  const options = {
    body:    data.body    ?? '',
    icon:    data.icon    ?? '/icons/icon-192.png',
    badge:   data.badge   ?? '/icons/icon-72.png',
    dir:     'rtl',
    lang:    'ar',
    vibrate: [200, 100, 200],
    data:    data.data    ?? {},
    actions: data.actions ?? [
      { action: 'open',    title: 'فتح التطبيق' },
      { action: 'dismiss', title: 'إغلاق' },
    ],
    tag:              data.tag             ?? 'almudir-notification',
    renotify:         true,
    requireInteraction: data.important ?? false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'المدير', options)
  );
});

/* ============================================================
   NOTIFICATION CLICK EVENT
   ============================================================ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data   = event.notification.data;

  if (action === 'dismiss') return;

  const urlToOpen = data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        /* Focus existing window */
        const existing = clients.find(c => c.url === urlToOpen);
        if (existing) return existing.focus();

        /* Open new window */
        return self.clients.openWindow(urlToOpen);
      })
  );
});

/* ============================================================
   MESSAGE HANDLER (from main thread)
   ============================================================ */
self.addEventListener('message', (event) => {
  const { type, payload } = event.data ?? {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys().then(keys =>
          Promise.all(keys.map(k => caches.delete(k)))
        ).then(() => {
          event.source?.postMessage({ type: 'CACHE_CLEARED' });
        })
      );
      break;

    case 'GET_VERSION':
      event.source?.postMessage({
        type:    'SW_VERSION',
        version: SW_VERSION,
      });
      break;

    case 'CACHE_ASSET':
      if (payload?.url) {
        event.waitUntil(
          caches.open(DYNAMIC_CACHE).then(c => c.add(payload.url))
        );
      }
      break;
  }
});

console.log(`[SW] 🚀 ${SW_VERSION} loaded`);