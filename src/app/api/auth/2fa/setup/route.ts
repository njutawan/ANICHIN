import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import {
  generateTwoFactorSecret,
  generateQrCodeDataURL,
  setPendingSecret,
} from '@/lib/two-factor';

/**
 * POST /api/auth/2fa/setup
 *
 * Begins the 2FA enable flow for the authenticated user:
 *   1. Generates a fresh TOTP secret (NOT stored in DB yet).
 *   2. Stashes it in an in-memory pending store keyed by user ID (5 min TTL).
 *   3. Returns the secret, otpauth URL, and a QR data: URL so the frontend can
 *      render the QR code for the user's authenticator app.
 *
 * The user must then call /api/auth/2fa/enable with a valid 6-digit token
 * generated from this secret. Only then is the secret persisted to the DB.
 *
 * If the user already has 2FA enabled, this endpoint refuses (409) — they
 * should disable first.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth tier rate limit (20 req/60s per IP)
    const limited = await checkRateLimit(req, 'auth');
    if (limited) return limited;

    const [session, err] = await requireUser(req);
    if (err) return err;

    const userId = session!.user.id;

    // Refuse if 2FA already enabled (must disable first to rotate secret)
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, email: true, name: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'Akun tidak ditemukan.' },
        { status: 404 }
      );
    }
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA sudah aktif. Nonaktifkan dulu untuk memutar secret baru.' },
        { status: 409 }
      );
    }

    // Generate new secret + otpauth URL
    const displayName = user.email || session!.user.email || 'user';
    const { secret, otpauthUrl } = generateTwoFactorSecret(displayName);

    // Stash in pending store (5 min TTL) so /enable can verify without
    // trusting a client-supplied secret
    setPendingSecret(userId, secret, otpauthUrl);

    // Render QR as data: URL (synchronous-ish; safe to await here)
    let qrCodeDataUrl: string;
    try {
      qrCodeDataUrl = await generateQrCodeDataURL(otpauthUrl);
    } catch (qrErr) {
      logger.error('[2fa/setup] QR generation failed:', { error: qrErr instanceof Error ? qrErr.message : String(qrErr) });
      return NextResponse.json(
        { error: 'Gagal membuat QR code. Coba lagi.' },
        { status: 500 }
      );
    }

    return addRateLimitHeaders(
      NextResponse.json(
        {
          secret,
          otpauthUrl,
          qrCodeDataUrl,
          // Hint to the frontend that the pending secret expires in 5 min
          expiresInSec: 300,
        },
        { status: 200 }
      ),
      'auth'
    );
  } catch (err) {
    logger.error('[2fa/setup] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Gagal menyiapkan 2FA. Coba lagi.' },
      { status: 500 }
    );
  }
}
