import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import {
  verifyTwoFactorToken,
  generateBackupCodes,
  encryptSecret,
  getPendingSecret,
  clearPendingSecret,
} from '@/lib/two-factor';

/**
 * POST /api/auth/2fa/enable
 *
 * Completes the 2FA enable flow:
 *   1. Pulls the pending secret from the in-memory store (set by /setup).
 *   2. Verifies the user-supplied 6-digit TOTP token against that secret.
 *   3. If valid: encrypts the secret, persists to user.twoFactorSecret + sets
 *      user.twoFactorEnabled = true.
 *   4. Generates 8 single-use backup codes (shown once to the user).
 *   5. Returns { enabled: true, backupCodes } so the frontend can render the
 *      one-time backup-code display.
 *
 * Body: { token: string }
 *
 * If the pending secret has expired (5 min) or is missing, returns 410 Gone
 * (user must call /setup again).
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 'auth');
    if (limited) return limited;

    // Body size guard
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > 4096) {
      return NextResponse.json(
        { error: 'Payload terlalu besar.' },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Format request tidak valid.' },
        { status: 400 }
      );
    }

    const { token } = (body ?? {}) as { token?: unknown };

    if (typeof token !== 'string' || !token.trim()) {
      return NextResponse.json(
        { error: 'Kode 6-digit wajib diisi.' },
        { status: 400 }
      );
    }

    const [session, err] = await requireUser(req);
    if (err) return err;

    const userId = session!.user.id;

    // Bail if already enabled (idempotency guard — don't overwrite existing secret)
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'Akun tidak ditemukan.' },
        { status: 404 }
      );
    }
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA sudah aktif untuk akun ini.' },
        { status: 409 }
      );
    }

    // Pull pending secret from in-memory store
    const pending = getPendingSecret(userId);
    if (!pending) {
      return NextResponse.json(
        {
          error:
            'Sesi setup 2FA sudah kedaluwarsa. Silakan mulai ulang dari awal.',
        },
        { status: 410 } // 410 Gone — resource no longer available
      );
    }

    // Verify the 6-digit TOTP token
    if (!verifyTwoFactorToken(token, pending.secret)) {
      // Do NOT clear the pending secret on failure — user gets a few attempts
      // (rate-limit already throttles this endpoint at 20 req/min).
      return NextResponse.json(
        { error: 'Kode tidak valid. Coba lagi.' },
        { status: 400 }
      );
    }

    // Success — encrypt + persist
    let encryptedSecret: string;
    try {
      encryptedSecret = encryptSecret(pending.secret);
    } catch (encErr) {
      logger.error('[2fa/enable] encryptSecret failed:', { error: encErr instanceof Error ? encErr.message : String(encErr) });
      return NextResponse.json(
        { error: 'Gagal mengenkripsi secret. Periksa konfigurasi server.' },
        { status: 500 }
      );
    }

    await db.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: true,
      },
    });

    // Clear the pending secret — it's now persisted
    clearPendingSecret(userId);

    // Generate 8 backup codes (shown ONCE to the user)
    const backupCodes = generateBackupCodes(8);

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[2fa/enable] 2FA enabled for user ${userId}`);
    }

    return addRateLimitHeaders(
      NextResponse.json(
        {
          enabled: true,
          backupCodes,
        },
        { status: 200 }
      ),
      'auth'
    );
  } catch (err) {
    logger.error('[2fa/enable] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Gagal mengaktifkan 2FA. Coba lagi.' },
      { status: 500 }
    );
  }
}
