import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { createVerificationToken, sendVerificationEmail } from '@/lib/email';

/**
 * POST /api/auth/send-verification
 *
 * Generates a fresh email-verification token for the authenticated user and
 * "sends" the verification email (in dev: logged to console + URL returned so
 * the test harness can hit it; in prod: would call SMTP — currently logs only).
 *
 * Behavior:
 *  - Requires authenticated user.
 *  - If user.emailVerified is already set → { alreadyVerified: true } (200).
 *  - Otherwise: create token, build URL, send email, return { sent: true }.
 *  - In dev / no-SMTP mode, also returns `devUrl` so QA can click through.
 *  - Sanitization: doesn't leak the user's email in the response beyond a
 *    generic confirmation. The token is NEVER returned to the client.
 *
 * Rate limit: auth tier (20 req/60s per IP — generous enough to allow the
 * "resend" button + banner click without tripping, but blocks scripted abuse).
 *
 * Response:
 *   200 { alreadyVerified: true }
 *   200 { sent: true, devUrl?: string }
 *   401 { error: 'Login dulu buat akses fitur ini.' }
 *   429 { error, retryAfter }
 *   500 { error: 'Gagal mengirim email verifikasi. Coba lagi.' }
 */
export async function POST(req: NextRequest) {
  try {
    // Auth tier rate limit (20 req/60s per IP). Prevents spam but allows
    // legitimate resend flows.
    const limited = await checkRateLimit(req, 'auth');
    if (limited) return limited;

    const [session, err] = await requireUser(req);
    if (err) return err;

    const userId = session!.user.id;

    // Fetch current verification state.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true, name: true },
    });

    if (!user) {
      // Defensive: session claims a user that doesn't exist. Don't leak.
      return NextResponse.json(
        { error: 'Akun tidak ditemukan.' },
        { status: 404 }
      );
    }

    // Already verified — short-circuit with a clean flag so the client can
    // hide the banner.
    if (user.emailVerified) {
      return addRateLimitHeaders(
        NextResponse.json(
          { alreadyVerified: true, sent: false },
          { status: 200 }
        ),
        'auth'
      );
    }

    // Create fresh token (single active per user — old unused tokens deleted).
    const { token } = await createVerificationToken(userId);

    // Build verification URL. NEXTAUTH_URL is the canonical public base.
    const baseUrl = process.env.NEXTAUTH_URL || '';
    if (!baseUrl) {
      logger.error(
        '[send-verification] NEXTAUTH_URL not set — cannot build verification URL'
      );
      return NextResponse.json(
        { error: 'Konfigurasi server tidak lengkap.' },
        { status: 500 }
      );
    }

    const verificationUrl = `${baseUrl.replace(/\/$/, '')}/api/auth/verify-email?token=${token}`;

    // Send the email (dev: console + returns devUrl; prod: would SMTP).
    const result = await sendVerificationEmail(user.email, verificationUrl);

    if (!result.delivered) {
      // SMTP failure (future). Don't leak the cause to the client.
      logger.error('[send-verification] email delivery failed');
      return NextResponse.json(
        { error: 'Gagal mengirim email verifikasi. Coba lagi.' },
        { status: 502 }
      );
    }

    // Build response. In dev/no-SMTP, surface devUrl so QA can hit the link.
    // In prod w/ SMTP, devUrl is undefined (token stays out of the response).
    const payload: { sent: boolean; devUrl?: string } = { sent: true };
    if (result.devUrl) {
      payload.devUrl = result.devUrl;
    }

    return addRateLimitHeaders(
      NextResponse.json(payload, { status: 200 }),
      'auth'
    );
  } catch (err) {
    logger.error('[send-verification] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Gagal mengirim email verifikasi. Coba lagi.' },
      { status: 500 }
    );
  }
}
