import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { db } from '@/lib/db';

/**
 * GET /api/auth/verification-status
 *
 * Returns whether the authenticated user's email is verified + the email
 * address itself (so the banner can show "verifikasi email kamu
 * (user@example.com)").
 *
 * Response:
 *   200 { verified: boolean, email: string }
 *   401 { error: 'Login dulu buat akses fitur ini.' }
 *   429 { error, retryAfter }
 *   500 { error: 'Gagal mengambil status verifikasi.' }
 *
 * Rate limit: read tier (60 req/60s per IP). The banner polls this on mount
 * + on focus — read tier is plenty.
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
      select: { email: true, emailVerified: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Akun tidak ditemukan.' },
        { status: 404 }
      );
    }

    return addRateLimitHeaders(
      NextResponse.json(
        {
          verified: !!user.emailVerified,
          email: user.email,
        },
        { status: 200 }
      ),
      'read'
    );
  } catch (err) {
    logger.error('[verification-status] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Gagal mengambil status verifikasi.' },
      { status: 500 }
    );
  }
}
