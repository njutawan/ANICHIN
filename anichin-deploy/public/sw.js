/**
 * AniChin Service Worker — PWA offline support + cache strategy.
 *
 * Caching strategy:
 * - App shell (HTML routes): Network-first, fallback to cache (fresh content when online, offline fallback)
 * - Static assets (_next/static, images): Cache-first, long TTL (immutable)
 * - API GET: Network-first, short cache (5 min) — stale-while-revalidate
 * - API POST/mutations: Network-only (never cache)
 * - Fonts: Cache-first, long TTL
 *
 * Versioning: bump CACHE_VERSION on deploy to invalidate old caches.
 */

const CACHE_VERSION = 'anichin-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Assets to precache on install (app shell)
const PRECACHE_URLS = ['/', '/offline', '/logo.svg', '/manifest.webmanifest'];

// Maximum entries per cache (LRU eviction)
const MAX_CACHE_ENTRIES = 50;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests (mutations never cached)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin requests (except fonts/images from CDNs)
  if (url.origin !== self.location.origin) {
    // Allow fonts from Google Fonts
    if (
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com'
    ) {
      event.respondWith(cacheFirst(request, STATIC_CACHE, 30 * 24 * 60 * 60));
    }
    return;
  }

  // Skip auth endpoints (never cache — security)
  if (url.pathname.startsWith('/api/auth/')) return;

  // Skip Next.js HMR in dev
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // --- Route by request destination ---
  // 1. Navigation (HTML pages) — network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }

  // 2. Static assets (_next/static) — cache-first (immutable)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 365 * 24 * 60 * 60));
    return;
  }

  // 3. Images — cache-first with network update
  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // 4. API GET endpoints — network-first with short cache
  if (url.pathname.startsWith('/api/')) {
    // Don't cache /api/auth, /api/health, /api/analytics
    if (
      url.pathname.startsWith('/api/health') ||
      url.pathname.startsWith('/api/analytics')
    ) {
      return; // Network-only
    }
    event.respondWith(networkFirst(request, API_CACHE, 5 * 60));
    return;
  }

  // 5. Everything else — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE, 24 * 60 * 60));
});

// --- Cache strategies ---

async function cacheFirst(request, cacheName, maxAgeSec) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      cache.put(request, res.clone());
      evictOldEntries(cache, MAX_CACHE_ENTRIES);
    }
    return res;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName, maxAgeSec) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) {
      cache.put(request, res.clone());
      evictOldEntries(cache, MAX_CACHE_ENTRIES);
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithOffline(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic') {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    // Offline — try cache, then fallback to offline page
    const cached = await cache.match(request);
    if (cached) return cached;
    const offlinePage = await caches.match('/offline');
    return offlinePage || caches.match('/');
  }
}

async function staleWhileRevalidate(request, cacheName, maxAgeSec) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone());
        evictOldEntries(cache, MAX_CACHE_ENTRIES);
      }
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function evictOldEntries(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    // Delete oldest entries (first in = oldest)
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

// Handle messages from client (e.g., "skipWaiting" for instant update)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
