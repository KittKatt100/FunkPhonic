// ===== FunkPhonic Frontend Service Worker =====
// Version your cache to force updates after deploys
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `funkphonic-cache-${CACHE_VERSION}`;

// Core files to cache for offline usage (no icons yet)
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

// If you host in a subfolder (GitHub Pages), set BASE_PATH to '/FunkPhonic/'
// and prefix APP_SHELL items with it. For root hosting, leave as ''.
const BASE_PATH = ''; // e.g., '/FunkPhonic'

// Optionally list domains you treat as "API" (network-first)
const API_HOSTS = [
  'workers.dev',           // Cloudflare Worker backend
  'api.elevenlabs.io'      // direct calls (if ever used)
];

// ----- Install: pre-cache app shell -----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const urls = APP_SHELL.map(u => BASE_PATH + u);
      return cache.addAll(urls);
    }).then(() => self.skipWaiting())
  );
});

// ----- Activate: clean old caches -----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('funkphonic-cache-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Utility: is this request to an API host?
function isApiRequest(url) {
  try {
    const u = new URL(url);
    return API_HOSTS.some(host => u.hostname.includes(host));
  } catch (e) {
    return false;
  }
}

// Utility: should we cache this response?
function isCachableResponse(response) {
  // Only cache successful, basic or CORS responses (not opaque errors)
  if (!response || response.status !== 200) return false;
  const type = response.type; // basic, cors, opaque
  if (type !== 'basic' && type !== 'cors') return false;

  // Avoid caching large audio blobs by default
  const ct = response.headers.get('Content-Type') || '';
  if (ct.startsWith('audio/')) return false;

  return true;
}

// ----- Fetch: smart strategy -----
// - App shell/static: Cache-first (fast, offline-friendly)
// - API/audio: Network-first (fresh data), fallback to cache if available
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = req.url;

  // Only handle GET
  if (req.method !== 'GET') return;

  // Network-first for API-style requests
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Optionally cache API GET responses if small/JSON
          if (isCachableResponse(res)) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req)) // fallback if offline
    );
    return;
  }

  // Cache-first for same-origin navigations and static assets
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (isCachableResponse(res)) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return res;
      }).catch(() => {
        // Offline fallback for navigations
        if (req.mode === 'navigate') {
          return caches.match(BASE_PATH + '/index.html');
        }
        throw new Error('Network error and no cache.');
      });
    })
  );
});

// ----- Optional: allow page to trigger immediate SW activation -----
self.addEventListener('message', event => {
  const msg = event.data;
  if (msg && msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

