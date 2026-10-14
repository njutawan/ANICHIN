import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { countRemainingBackupCodes } from '@/lib/two-factor-backup';

/**
 * GET /api/auth/2fa/status
 *
 * Returns whether 2FA is currently enabled for the authenticated user.
 * Used by the 2FA settings page to render the correct initial state
 * (enable vs. disable flow).
 *
 * Response: { enabled: boolean, backupCodesRemaining: number }
 *
 * `backupCodesRemaining` dipakai halaman /auth/2fa untuk memperingatkan pengguna
 * yang kode cadangannya sudah habis/terpakai (F-10).
 *
 * Rate limit: read tier (60 req/60s).
 */
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;

    const [session, err] = await requireUser(req);
    if (err) return err;

    const userId = session!.user.id;

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

    // Hitung kode cadangan yang belum terpakai — hanya bila 2FA aktif.
    const backupCodesRemaining = user.twoFactorEnabled
      ? await countRemainingBackupCodes(userId)
      : 0;

    return addRateLimitHeaders(
      NextResponse.json(
        { enabled: user.twoFactorEnabled, backupCodesRemaining },
        { status: 200 }
      ),
      'read'
    );
  } catch (err) {
    logger.error('[2fa/status] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Gagal mengambil status 2FA.' },
      { status: 500 }
    );
  }
}
