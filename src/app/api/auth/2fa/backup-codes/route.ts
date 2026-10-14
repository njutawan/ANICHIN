import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { compareSync } from 'bcryptjs';
import { generateBackupCodes } from '@/lib/two-factor';
import { saveBackupCodes } from '@/lib/two-factor-backup';

/**
 * POST /api/auth/2fa/backup-codes — buat ulang kode cadangan 2FA (F-10).
 *
 * Body: { password: string }
 * Respons: 200 { backupCodes: string[], count: number }
 *
 * Kode cadangan = satu-satunya jalur masuk bila authenticator hilang. Tanpa
 * endpoint ini, pengguna yang kode cadangannya habis/tercecer tidak punya cara
 * memperbaruinya (harus menonaktifkan 2FA, yang justru butuh kode TOTP).
 *
 * Aturan:
 *   - wajib login (requireUser) DAN memasukkan password ulang, supaya sesi yang
 *     dicuri (cookie) tidak cukup untuk menerbitkan kredensial pemulihan baru;
 *   - 2FA harus aktif (kalau tidak, kode cadangan tidak punya arti);
 *   - semua kode lama dihapus dalam operasi yang sama (saveBackupCodes), jadi
 *     kode lama langsung tidak berlaku begitu kode baru dibuat;
 *   - kode plaintext dikembalikan sekali; yang tersimpan hanya hash bcrypt.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 'auth');
    if (limited) return limited;

    // Body size guard
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > 4096) {
      return NextResponse.json({ error: 'Payload terlalu besar.' }, { status: 413 });
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
        { error: 'Password wajib diisi untuk membuat kode cadangan baru.' },
        { status: 400 }
      );
    }
    if (password.length > 1024) {
      return NextResponse.json({ error: 'Password tidak valid.' }, { status: 400 });
    }

    const [session, err] = await requireUser(req);
    if (err) return err;

    const userId = session!.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { password: true, twoFactorEnabled: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 });
    }
    if (!user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA belum aktif untuk akun ini.' },
        { status: 409 }
      );
    }

    // Password re-entry (bcrypt). Pesan generik: jangan bedakan "password salah"
    // dari kondisi lain yang bisa diprobe.
    if (!compareSync(password, user.password)) {
      logger.warn('[2fa/backup-codes] password salah saat regenerate kode', {
        userId,
      });
      return NextResponse.json({ error: 'Password salah. Coba lagi.' }, { status: 401 });
    }

    const backupCodes = generateBackupCodes(8);
    try {
      await saveBackupCodes(userId, backupCodes);
    } catch (saveErr) {
      logger.error('[2fa/backup-codes] gagal menyimpan kode cadangan:', {
        error: saveErr instanceof Error ? saveErr.message : String(saveErr),
      });
      return NextResponse.json(
        { error: 'Gagal menyimpan kode cadangan. Coba lagi.' },
        { status: 500 }
      );
    }

    // Catatan: regenerate TIDAK mencabut sesi (sessionVersion) — kode cadangan
    // bukan faktor yang menjaga sesi berjalan, dan pemilik yang sah tidak perlu
    // logout dari perangkatnya sendiri karena memperbarui kode pemulihan.
    logger.warn('[2fa/backup-codes] kode cadangan dibuat ulang', { userId });

    return addRateLimitHeaders(
      NextResponse.json(
        { backupCodes, count: backupCodes.length },
        { status: 200 }
      ),
      'auth'
    );
  } catch (err) {
    logger.error('[2fa/backup-codes] Unexpected error:', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Gagal membuat kode cadangan baru. Coba lagi.' },
      { status: 500 }
    );
  }
}
