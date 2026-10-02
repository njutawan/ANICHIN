import { buildServiceWorkerScript } from '@/lib/service-worker';

/**
 * `/sw.js` — skrip service worker.
 *
 * P2: dulu berkas statis di `public/sw.js` dengan `CACHE_VERSION` manual.
 * Sekarang dilayani route handler yang menyuntikkan build id (commit SHA dari
 * `next.config.ts` → `NEXT_PUBLIC_BUILD_ID`), jadi setiap deploy menaikkan
 * versi cache dan cache lama dibuang di event `activate` — tanpa langkah
 * manual yang gampang lupa.
 *
 * `force-static`: isinya sudah dibekukan saat build (build id di-inline), jadi
 * cukup dirender sekali dan boleh di-cache CDN.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const script = buildServiceWorkerScript(process.env.NEXT_PUBLIC_BUILD_ID);

  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Service worker harus bisa di-update: jangan simpan lama di browser/CDN.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      // Izinkan SW mengendalikan seluruh origin (default-nya folder skrip).
      'Service-Worker-Allowed': '/',
    },
  });
}
