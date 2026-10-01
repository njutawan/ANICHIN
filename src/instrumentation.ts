/**
 * Next.js instrumentation hook — runs once on server startup.
 * Initializes Sentry (if DSN configured) for error monitoring.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 * Sentry Next.js: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

export async function register() {
  // Only run Sentry on Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const sentryDsn = process.env.SENTRY_DSN;

    if (sentryDsn) {
      try {
        const Sentry = await import('@sentry/nextjs');

        Sentry.init({
          dsn: sentryDsn,

          // Adjust sampling in production:
          // - Traces: 10% (enough to spot perf regressions without blowing quota)
          // - Session replays: 1% (rare, high-value debugging)
          tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
          replaysSessionSampleRate: 0.01,
          replaysOnErrorSampleRate: 1.0, // 100% on errors

          // Environment + release tagging
          environment: process.env.NODE_ENV ?? 'development',
          release: process.env.SENTRY_RELEASE ?? 'anichin@1.0.0',

          // Filter out noise — don't send rate limit / auth errors to Sentry
          ignoreErrors: [
            'NEXT_NOT_FOUND',
            'NEXT_REDIRECT',
            'Rate limit exceeded',
            'Unauthorized',
            'CSRF mismatch',
          ],

          // Don't send PII (privacy)
          sendDefaultPii: false,

          // Disable in development unless explicitly enabled
          enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_DEBUG === 'true',
        });

        console.log('[instrumentation] Sentry initialized');
      } catch (err) {
        console.warn('[instrumentation] Sentry init failed:', err);
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[instrumentation] SENTRY_DSN not set — error monitoring disabled');
    }
  }
}
