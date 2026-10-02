/**
 * AniChin Service Worker — sumber skrip `/sw.js`.
 *
 * P2: sebelumnya `public/sw.js` menyimpan `CACHE_VERSION = 'anichin-v1'` yang
 * di-bump **manual**; lupa bump = pengguna tertahan aset lama. Sekarang versi
 * disuntikkan saat build dari `NEXT_PUBLIC_BUILD_ID` (commit SHA, lihat
 * `next.config.ts`) lewat route handler `src/app/sw.js/route.ts`, jadi setiap
 * deploy otomatis membuang cache lama.
 *
 * Catatan format: isi SW disimpan sebagai template literal, karena itu sengaja
 * **tidak memakai backtick/`${}`** di dalamnya (pakai konkatenasi `+`) supaya
 * tidak perlu escaping. Placeholder `__CACHE_VERSION__` diganti
 * `buildServiceWorkerScript()`.
 */

export const CACHE_VERSION_PLACEHOLDER = '__CACHE_VERSION__';

/** Bersihkan build id supaya tidak bisa menyuntik kode ke dalam skrip SW. */
export function sanitizeBuildId(buildId: string | undefined | null): string {
  const cleaned = (buildId ?? '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
  return cleaned.length > 0 ? cleaned : 'dev';
}

/**
 * Bangun isi `/sw.js` dengan versi cache dari build id.
 * Setiap deploy (SHA berbeda) otomatis meng-invalidasi cache lama.
 */
export function buildServiceWorkerScript(buildId: string | undefined | null): string {
  return SERVICE_WORKER_SOURCE.replace(CACHE_VERSION_PLACEHOLDER, 'anichin-' + sanitizeBuildId(buildId));
}

const SERVICE_WORKER_SOURCE = `
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
 * Versioning: CACHE_VERSION disuntikkan saat build (commit SHA) — jangan
 * di-edit manual. Cache lama otomatis dihapus di event 'activate'.
 */

const CACHE_VERSION = '__CACHE_VERSION__';
const STATIC_CACHE = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';
const API_CACHE = CACHE_VERSION + '-api';

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
            .filter((key) => key.indexOf(CACHE_VERSION) !== 0)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

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
  if (url.pathname.indexOf('/api/auth/') === 0) return;

  // Skip Next.js HMR in dev
  if (url.pathname.indexOf('/_next/webpack-hmr') === 0) return;

  // --- Route by request destination ---
  // 1. Navigation (HTML pages) — network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }

  // 2. Static assets (_next/static) — cache-first (immutable)
  if (
    url.pathname.indexOf('/_next/static/') === 0 ||
    url.pathname.indexOf('/_next/image') === 0
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
  if (url.pathname.indexOf('/api/') === 0) {
    // Don't cache /api/auth, /api/health, /api/analytics
    if (
      url.pathname.indexOf('/api/health') === 0 ||
      url.pathname.indexOf('/api/analytics') === 0
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
`;
