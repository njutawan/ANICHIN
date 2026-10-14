import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sanitizeDisplayName } from '@/lib/security';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side auth helpers — typed session, route guards, role checks.
 * Use these in API routes instead of calling getServerSession directly.
 *
 * ── Kenapa memakai `getServerSession(authOptions)` (bukan decode JWT sendiri) ──
 * Pencabutan sesi (audit F-06, `sessionVersion` di src/lib/auth.ts) HANYA bekerja
 * kalau server memeriksa DB saat request. Decode JWT saja tidak bisa mencabut
 * apa pun: salinan cookie yang dicuri tidak pernah "di-refresh", jadi token lama
 * tetap sah sampai kedaluwarsa. Karena itu guard di sini menempuh jalur session
 * NextAuth, yang menjalankan `jwt` callback kami → `sessionVersion` dibandingkan
 * dengan DB (dibatasi `SESSION_REVALIDATE_SECONDS`, default 60 detik).
 *
 * Kontrak yang dikunci di sini:
 *   - sesi tanpa `id`/`role` (artinya sudah dicabut karena password/role berubah
 *     atau akun dihapus) → dianggap BELUM LOGIN (fail closed),
 *   - error apa pun saat menyusun sesi (termasuk secret hilang di produksi) →
 *     null, bukan sesi kosong yang lolos otorisasi.
 */

export interface AppUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: 'user' | 'admin';
}

export interface AppSession {
  user: AppUser;
  expires: string;
}

/**
 * Get the current session on the server (API routes, server components).
 * Returns a typed AppSession or null if not authenticated / already revoked.
 */
export async function getServerAuthSession(): Promise<AppSession | null> {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as Partial<AppUser> | undefined;

    // Sesi yang sudah dicabut kehilangan `id`/`role` (lihat `jwt` callback di
    // src/lib/auth.ts) — perlakukan sebagai belum login, jangan "user kosong".
    if (!user?.id || !user.role) return null;

    return {
      user: {
        id: user.id,
        role: user.role,
        name: sanitizeDisplayName(user.name ?? 'Anonim'),
        email: user.email ?? '',
        image: user.image ?? null,
      },
      expires: session!.expires,
    };
  } catch (err) {
    // Fail closed: jangan pernah menganggap pengguna login ketika verifikasi
    // sesi gagal (token rusak, secret hilang, DB tidak bisa diakses saat
    // membentuk sesi).
    logger.error('[session] gagal menyusun sesi:', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Require an authenticated user. Returns the session or a 401 response.
 *
 * @example
 * const [session, err] = await requireUser(req);
 * if (err) return err;
 * // session is now defined
 */
export async function requireUser(
  _req?: NextRequest
): Promise<[AppSession | null, NextResponse | null]> {
  const session = await getServerAuthSession();
  if (!session) {
    return [
      null,
      NextResponse.json(
        { error: 'Login dulu buat akses fitur ini.' },
        { status: 401 }
      ),
    ];
  }
  return [session, null];
}

/**
 * Require an admin user. Returns the session or a 401/403 response.
 */
export async function requireAdmin(
  _req?: NextRequest
): Promise<[AppSession | null, NextResponse | null]> {
  const [session, err] = await requireUser();
  if (err) return [null, err];
  if (session!.user.role !== 'admin') {
    return [
      null,
      NextResponse.json(
        { error: 'Akses ditolak. Butuh hak admin.' },
        { status: 403 }
      ),
    ];
  }
  return [session, null];
}

/**
 * Get the current user ID, or null if not authenticated.
 * Convenience wrapper for the common case.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerAuthSession();
  return session?.user.id ?? null;
}

/**
 * Check if current user is admin.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getServerAuthSession();
  return session?.user.role === 'admin';
}
