import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyEmailToken } from '@/lib/email';

/**
 * GET /api/auth/verify-email?token=...
 *
 * Email-link verification endpoint. The user clicks this link from their
 * inbox (or, in dev, from the console.log output of sendVerificationEmail).
 *
 * Behavior:
 *  - No auth required — link is the credential (token is 256-bit CSPRNG).
 *  - No rate limit — users should always be able to verify from an email link.
 *  - On success: redirect to /?verified=1 (home, success toast).
 *  - On failure: redirect to /?verified=0&reason=... (home, error toast).
 *  - Missing/empty token: redirect to /?verified=0&reason=missing.
 *
 * Reason codes (Indonesian-friendly UI):
 *  - missing   — no token query param
 *  - not_found — token doesn't exist / malformed
 *  - expired   — token expired (>24h)
 *  - already_used — token already consumed
 *
 * The redirect target is always the home page; the frontend reads the query
 * params and shows a toast (sonner) accordingly.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  // Missing token — bail early.
  if (!token || !token.trim()) {
    const redirectUrl = new URL('/', url.origin);
    redirectUrl.searchParams.set('verified', '0');
    redirectUrl.searchParams.set('reason', 'missing');
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const result = await verifyEmailToken(token?.trim() || "");

    if (result.success) {
      // Success → home with success flag.
      const redirectUrl = new URL('/', url.origin);
      redirectUrl.searchParams.set('verified', '1');
      return NextResponse.redirect(redirectUrl);
    }

    // Failure → home with reason code (UI maps to Indonesian message).
    const redirectUrl = new URL('/', url.origin);
    redirectUrl.searchParams.set('verified', '0');
    redirectUrl.searchParams.set('reason', result.reason ?? 'unknown');
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    // Defensive: never 500 the user from an email link — bounce home with a
    // generic error so they can try resending from the banner.
    logger.error('[verify-email] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    const redirectUrl = new URL('/', url.origin);
    redirectUrl.searchParams.set('verified', '0');
    redirectUrl.searchParams.set('reason', 'error');
    return NextResponse.redirect(redirectUrl);
  }
}
