/**
 * Nama cookie NextAuth — SATU definisi, dipakai oleh:
 *   - `src/lib/auth.ts`         (NextAuth menulis cookie sesuai `cookies` config)
 *   - `src/proxy.ts`            (middleware Edge memverifikasi JWT untuk /admin)
 *   - `src/lib/session.ts`      (guard server-side: requireUser / requireAdmin)
 *
 * Mengapa file terpisah tanpa dependensi lain: `src/proxy.ts` berjalan di Edge
 * runtime, jadi ia TIDAK boleh mengimpor `src/lib/auth.ts` (menarik Prisma,
 * bcryptjs, otplib ke bundel middleware). File ini murni konstanta.
 *
 * ── Latar belakang (temuan F-18 pada docs/SECURITY-AUDIT.md) ────────────────
 * `authOptions.cookies` menimpa default NextAuth (`init.js`:
 * `{ ...defaultCookies(useSecureCookies), ...authOptions.cookies }`).
 * Konfigurasi lama menulis cookie bernama `next-auth.session-token` (tanpa
 * prefix) bahkan di produksi, sedangkan `getToken()` dari `next-auth/jwt`
 * menghitung sendiri nama yang dicarinya:
 *
 *     cookieName = secureCookie ? '__Secure-next-auth.session-token'
 *                               : 'next-auth.session-token'
 *     secureCookie = NEXTAUTH_URL?.startsWith('https://') ?? !!VERCEL
 *
 * Di produksi (NEXTAUTH_URL https) kedua sisi TIDAK cocok → `getToken()` selalu
 * mengembalikan null → middleware menganggap semua orang belum login dan
 * `/admin` tidak pernah bisa dibuka dari UI (API tetap jalan karena memakai
 * `getServerSession`, yang membaca cookie lewat `authOptions`).
 *
 * Solusi: nama cookie didefinisikan sekali di sini (dengan prefix yang benar:
 * `__Secure-` untuk session/callback/pkce, `__Host-` untuk CSRF sesuai default
 * NextAuth) dan setiap pemanggilan `getToken()` menerima `cookieName` +
 * `secureCookie` eksplisit, sehingga sisi penulis dan sisi pembaca tidak bisa
 * berbeda lagi.
 *
 * Catatan: prefix `__Secure-`/`__Host-` mengharuskan atribut `Secure` dan
 * (untuk `__Host-`) `Path=/` tanpa `Domain` — keduanya sudah dipenuhi
 * `cookieOptions()` di bawah. Karena nama cookie berubah, SEMUA sesi lama
 * otomatis logout satu kali saat deploy (cookie lama diabaikan browser).
 */

/** Cookie `Secure`: hanya saat produksi. Di dev (HTTP) tidak boleh di-set. */
export const USE_SECURE_COOKIES = process.env.NODE_ENV === 'production';

const SECURE_PREFIX = USE_SECURE_COOKIES ? '__Secure-' : '';
const HOST_PREFIX = USE_SECURE_COOKIES ? '__Host-' : '';

/** Cookie sesi (JWT) — dipakai middleware & guard server-side. */
export const SESSION_COOKIE_NAME = `${SECURE_PREFIX}next-auth.session-token`;
/** Cookie CSRF (dibaca/ditulis NextAuth sendiri; prefix `__Host-` di produksi). */
export const CSRF_COOKIE_NAME = `${HOST_PREFIX}next-auth.csrf-token`;
/** URL tujuan setelah login. */
export const CALLBACK_URL_COOKIE_NAME = `${SECURE_PREFIX}next-auth.callback-url`;
/** Verifier PKCE untuk OAuth. */
export const PKCE_COOKIE_NAME = `${SECURE_PREFIX}next-auth.pkce.code-verifier`;

/**
 * Atribut cookie sesi & CSRF (dipakai `authOptions.cookies`).
 */
export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: USE_SECURE_COOKIES,
});

/**
 * Parameter yang wajib dioper ke `getToken()` supaya pembaca cookie memakai nama
 * yang sama persis dengan penulisnya (lihat catatan di atas).
 */
export const tokenCookieParams = {
  cookieName: SESSION_COOKIE_NAME,
  secureCookie: USE_SECURE_COOKIES,
} as const;
