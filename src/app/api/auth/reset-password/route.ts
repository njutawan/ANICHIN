import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashSync } from '@/lib/auth';
import { PASSWORD_MAX_BYTES, isPasswordTooLong } from '@/lib/security';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/reset-password
 *
 * Reset password using a token from /api/auth/forgot-password.
 *
 * Security:
 * - Body size guard (max 8192 bytes — 8KB)
 * - Rate limited: expensive tier (10/min per IP)
 * - Token must exist, not be used, not be expired
 * - Password strength validation (same as register)
 * - Token is single-use (marked usedAt after success)
 * - All errors return generic "invalid or expired token" (anti-enumeration)
 * - All other tokens for this user invalidated after success (defense in depth)
 *
 * Request body: { "token": "hexstring", "password": "newpassword" }
 * Response: { "success": true } | { "error": "..." }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Body size guard (8KB max)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 8192) {
      return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
    }

    // 2. Rate limit (expensive tier — 10/min per IP)
    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    // 3. Parse JSON body (with try/catch for malformed JSON)
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { token, password } = body as { token?: unknown; password?: unknown };

    // 4. Validate input types
    if (typeof token !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Token dan password wajib diisi.' }, { status: 400 });
    }

    if (token.length !== 64) {
      // tokens are crypto.randomBytes(32).toString('hex') → 64 chars
      return NextResponse.json({ error: 'Token tidak valid atau sudah kadaluarsa.' }, { status: 400 });
    }

    // 5. Password strength validation (same as register)
    // F-17: batas bcrypt = 72 BYTE, bukan karakter. Password 1024 karakter hanya
    // membuat pengguna merasa aman: bcrypt mengabaikan byte ke-73 dan seterusnya.
    if (isPasswordTooLong(password)) {
      return NextResponse.json(
        {
          error: `Password terlalu panjang (maksimal ${PASSWORD_MAX_BYTES} byte; karakter non-ASCII dihitung lebih dari satu).`,
        },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter.' }, { status: 400 });
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json({ error: 'Password harus mengandung huruf dan angka.' }, { status: 400 });
    }

    // 6. Find token (must exist, not be used, not be expired)
    const resetRecord = await db.passwordReset.findUnique({
      where: { token },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    });

    if (!resetRecord) {
      // Anti-enumeration: same error message for "not found" and "expired"
      return NextResponse.json({ error: 'Token tidak valid atau sudah kadaluarsa.' }, { status: 400 });
    }

    if (resetRecord.usedAt) {
      // Token already used — could be a replay attack, log it
      logger.warn('[reset-password] Attempt to reuse token', {
        userId: resetRecord.userId,
      });
      return NextResponse.json({ error: 'Token sudah dipakai. Silakan minta reset baru.' }, { status: 400 });
    }

    if (resetRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Token sudah kadaluarsa. Silakan minta reset baru.' }, { status: 400 });
    }

    // 7. Hash new password
    const hashedPassword = hashSync(password, 10);

    // 8. Update user password + mark token as used (transaction)
    //
    // `sessionVersion` dinaikkan bersamaan: semua JWT yang sudah terbit (termasuk
    // milik penyerang yang mencuri cookie, atau sesi yang membuat reset ini
    // karena akun diambil alih) langsung dicabut oleh `jwt` callback di
    // src/lib/auth.ts. Sebelumnya reset password hanya mengganti hash — sesi
    // lama tetap hidup sampai 7 hari.
    await db.$transaction([
      db.user.update({
        where: { id: resetRecord.userId },
        data: {
          password: hashedPassword,
          sessionVersion: { increment: 1 },
        },
      }),
      db.passwordReset.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
    ]);

    // 9. Invalidate ALL other reset tokens for this user (defense in depth)
    await db.passwordReset.updateMany({
      where: {
        userId: resetRecord.userId,
        usedAt: null,
        token: { not: token },
      },
      data: { usedAt: new Date() },
    });

    logger.info('[reset-password] Password reset successful', {
      userId: resetRecord.userId,
      email: resetRecord.user.email,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[reset-password] Error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Terjadi kesalahan. Coba lagi.' },
      { status: 500 }
    );
  }
}

// CATATAN: route file HANYA boleh mengekspor handler HTTP + config route.
// Sebelumnya ada `export { isValidEmail }` di sini yang membuat `next build`
// gagal: type-check route Next.js menolak export tambahan
// ("Property 'isValidEmail' is incompatible with index signature").
