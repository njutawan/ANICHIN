/**
 * Client-side instrumentation — dijalankan Next.js di BROWSER sebelum hydration.
 *
 * Kenapa file ini ada:
 * Sebelumnya `src/sentry.client.config.ts` tidak pernah di-import siapa pun
 * (tidak ada `withSentryConfig()` di next.config.ts dan tidak ada
 * instrumentation client), sehingga SDK Sentry v10 **tidak pernah aktif di
 * browser** — error client-side tidak pernah terkirim, walau DSN sudah di-set.
 * Nama file ini adalah konvensi resmi Next.js + Sentry SDK v9/v10.
 *
 * Catatan: `instrumentation.ts` (server) menangani sisi Node.js/Edge.
 */

import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE ?? 'anichin@1.0.0',

    // Sampling: 10% trace di produksi, 100% saat dev/debug.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    // Jangan kirim PII (privacy).
    sendDefaultPii: false,

    // Noise yang tidak perlu dikirim ke Sentry.
    ignoreErrors: [
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
      'Rate limit exceeded',
      'Unauthorized',
      'ResizeObserver loop',
      'Non-Error promise rejection captured',
    ],

    // Nonaktif di dev kecuali diminta eksplisit (SENTRY_DEBUG=true).
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_DEBUG === 'true',
  });
}

/**
 * Wajib diekspor agar Sentry bisa mencatat navigasi client-side
 * (diperlukan SDK v9+; lihat peringatan `onRouterTransitionStart`).
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
