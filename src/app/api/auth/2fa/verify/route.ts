import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { db } from '@/lib/db';

/**
 * POST /api/auth/2fa/verify — status "perlu langkah 2FA?" untuk halaman login.
 *
 * Halaman login memakainya SETELAH `signIn('credentials')` gagal, untuk
 * membedakan "password/email salah" dari "password benar tapi butuh kode TOTP",
 * supaya form bisa menampilkan input kode 6 digit.
 *
 * Body: { email: string }
 * Respons: 200 { requiresTwoFactor: boolean }
 *
 * ── Kenapa endpoint ini TIDAK lagi memverifikasi kode TOTP ──────────────────
 * Versi sebelumnya menerima `{ email, token }` dan menjawab
 * `{ valid: true|false, requiresTwoFactor }` — artinya siapa pun (tanpa login,
 * tanpa password) bisa memvalidasi kode TOTP milik akun mana pun. Itu oracle
 * brute-force: kode TOTP hanya 6 digit, dan penyerang yang sudah punya password
 * cukup mencari kode yang sedang valid lewat endpoint ini (tanpa pernah menyentuh
 * lockout login), lalu memakainya sekali di `signIn`. Lockout 5×/15 menit di
 * `src/lib/auth.ts` jadi tidak berguna karena percobaan kode dilakukan di luar
 * alur login.
 *
 * Sekarang verifikasi TOTP HANYA terjadi di dalam NextAuth credentials callback
 * (`authorize()` di src/lib/auth.ts), yang:
 *   - memeriksa `isAccountLocked(email, ip)` sebelum verifikasi,
 *   - mencatat setiap kegagalan (`recordFailedAttempt`) → 5 gagal = terkunci
 *     15 menit per email+IP,
 *   - dan memverifikasi TOTP sebelum sesi dibuat.
 * Endpoint ini hanya membaca flag `twoFactorEnabled` (tanpa memakai token), jadi
 * tidak ada lagi jalur verifikasi kode di luar lockout.
 *
 * Catatan (sisa risiko yang diterima): respons membedakan akun dengan 2FA aktif
 * dari akun lain, sehingga email yang sudah diketahui bisa di-probe status
 * 2FA-nya. Ini diperlukan untuk UX (form login harus tahu kapan menampilkan
 * input kode) dan dibatasi rate limit tier `auth` (20 req/60s per IP). Kalau
 * nanti status 2FA harus benar-benar tertutup, endpoint ini perlu meminta
 * password dan memverifikasinya (dengan lockout yang sama) sebelum menjawab.
 */
export async function POST(req: NextRequest) {
  try {
    // Strict rate limit (auth tier, 20 req/60s per IP) — endpoint tidak
    // terautentikasi dan dipanggil saat login.
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

    const { email } = (body ?? {}) as { email?: unknown };

    if (typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email wajib diisi.' },
        { status: 400 }
      );
    }

    // Normalize email (same canonicalization as auth.ts authorize())
    const normalizedEmail = email.trim().toLowerCase();
    const emailRe = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRe.test(normalizedEmail) || normalizedEmail.length > 254) {
      return NextResponse.json(
        { error: 'Format email tidak valid.' },
        { status: 400 }
      );
    }

    // Hanya baca flag — tidak menyentuh `twoFactorSecret` sama sekali.
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { twoFactorEnabled: true },
    });

    // Akun tanpa 2FA / email tidak dikenal → langkah 2FA dilewati.
    const requiresTwoFactor = Boolean(user?.twoFactorEnabled);

    return addRateLimitHeaders(
      NextResponse.json({ requiresTwoFactor }, { status: 200 }),
      'auth'
    );
  } catch (err) {
    logger.error('[2fa/verify] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Gagal memeriksa status 2FA. Coba lagi.' },
      { status: 500 }
    );
  }
}
