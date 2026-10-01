/**
 * Sentry server-side config.
 * Auto-initialized by @sentry/nextjs when SENTRY_DSN is set.
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? 'anichin@1.0.0',

    ignoreErrors: [
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
      'Rate limit exceeded',
    ],

    sendDefaultPii: false,

    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_DEBUG === 'true',
  });
}
