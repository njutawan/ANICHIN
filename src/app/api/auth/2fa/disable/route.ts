import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { compareSync } from 'bcryptjs';
import { clearPendingSecret } from '@/lib/two-factor';

/**
 * POST /api/auth/2fa/disable
 *
 * Disables 2FA for the authenticated user. Requires password re-entry to
 * confirm the action (defense against session hijacking / stolen-cookie
 * attacks giving an attacker the ability to silently disable 2FA).
 *
 * Body: { password: string }
 *
 * On success: clears user.twoFactorSecret + sets user.twoFactorEnabled = false,
 * and also drops any pending setup secret for that user.
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

    const { password } = (body ?? {}) as { password?: unknown };

    if (typeof password !== 'string' || !password) {
      return NextResponse.json(
        { error: 'Password wajib diisi untuk menonaktifkan 2FA.' },
        { status: 400 }
      );
    }
    if (password.length > 1024) {
      return NextResponse.json(
        { error: 'Password tidak valid.' },
        { status: 400 }
      );
    }

    const [session, err] = await requireUser(req);
    if (err) return err;

    const userId = session!.user.id;

    // Fetch user with password hash
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { password: true, twoFactorEnabled: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'Akun tidak ditemukan.' },
        { status: 404 }
      );
    }

    if (!user.twoFactorEnabled) {
      // Idempotent — already disabled
      return addRateLimitHeaders(
        NextResponse.json({ disabled: true, alreadyDisabled: true }, { status: 200 }),
        'auth'
      );
    }

    // Verify password (bcrypt)
    const passwordValid = compareSync(password, user.password);
    if (!passwordValid) {
      // Generic error — don't leak that the password is wrong vs anything else
      return NextResponse.json(
        { error: 'Password salah. Coba lagi.' },
        { status: 401 }
      );
    }

    // Disable 2FA — clear secret + flag
    await db.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
      },
    });

    // Also clear any stale pending secret (e.g. user started setup, then
    // decided to disable instead)
    clearPendingSecret(userId);

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[2fa/disable] 2FA disabled for user ${userId}`);
    }

    return addRateLimitHeaders(
      NextResponse.json({ disabled: true }, { status: 200 }),
      'auth'
    );
  } catch (err) {
    logger.error('[2fa/disable] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Gagal menonaktifkan 2FA. Coba lagi.' },
      { status: 500 }
    );
  }
}
