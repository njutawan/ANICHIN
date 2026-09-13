/**
 * Sentry client-side config.
 * Auto-initialized by @sentry/nextjs when SENTRY_DSN is set.
 *
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Adjust sampling in production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? 'anichin@1.0.0',

    // Filter noise
    ignoreErrors: [
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
      'ResizeObserver loop limit exceeded',
      'Network request failed',
    ],

    sendDefaultPii: false,

    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_DEBUG === 'true',
  });
}
