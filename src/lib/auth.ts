import { logger } from '@/lib/logger';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import { db } from '@/lib/db';
import { compareSync, hashSync } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sanitizeDisplayName } from '@/lib/security';
import {
  CALLBACK_URL_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  PKCE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  USE_SECURE_COOKIES,
  cookieOptions,
} from '@/lib/auth-cookies';
import { getClientIp } from '@/lib/ip';
import {
  isLocked as storeIsLocked,
  incrFails,
  clearFails,
} from '@/lib/rate-limit-store';
import {
  verifyTwoFactorToken,
  decryptSecret,
  isBackupCode,
} from '@/lib/two-factor';
import { consumeBackupCode } from '@/lib/two-factor-backup';
import { validateAuthSecret } from '@/lib/production-env';

/**
 * Auth optimization (Round 18 + Round 21):
 * 1. Strong cookie hardening (Secure, HttpOnly, SameSite=Lax, prefixed)
 * 2. Session/JWT expiry tuned (30 days for session, 7 days for JWT absolute)
 * 3. Typed session.user with id + role (augmentation in src/types/next-auth.d.ts)
 * 4. Login attempt tracking + temporary lockout (Redis-backed, in-memory fallback)
 * 5. Email + name server-side normalization & validation
 * 6. Trusted host flag (set true once HTTPS domain is fixed in production)
 * 7. No fallback secret in production — throw if missing
 */

// --- Login attempt config (Redis-backed via rate-limit-store) ---
// 5 failed attempts → 15-min lockout per email+IP.
const MAX_FAILS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const FAIL_WINDOW_MS = 15 * 60 * 1000; // fails counted within 15-min window

function getAttemptKey(email: string, ip: string): string {
  return `${email.toLowerCase()}::${ip}`;
}

// Async wrappers (delegate to Redis/in-memory store)
async function recordFailedAttempt(email: string, ip: string): Promise<void> {
  const key = getAttemptKey(email, ip);
  const fails = await incrFails(key, FAIL_WINDOW_MS);
  if (fails >= MAX_FAILS) {
    // Lock this email+IP for 15 minutes
    const { setLock } = await import('@/lib/rate-limit-store');
    await setLock(key, LOCK_DURATION_MS);
  }
}

async function isAccountLocked(email: string, ip: string): Promise<boolean> {
  const key = getAttemptKey(email, ip);
  return storeIsLocked(key);
}

async function clearAttempts(email: string, ip: string): Promise<void> {
  const key = getAttemptKey(email, ip);
  await clearFails(key);
}

// --- Session revalidation window ---
/**
 * Jeda minimum antara dua validasi sesi ke DB (ms).
 *
 * JWT bersifat stateless: tanpa cek ke DB, token yang sudah dicabut (password
 * direset / role diturunkan / akun dihapus) tetap berlaku sampai kedaluwarsa —
 * dulu hingga 7 hari. Karena itu token disimpan bersama `sessionVersion` dan
 * divalidasi ulang ke DB secara berkala; `SESSION_REVALIDATE_SECONDS`
 * menentukan seberapa cepat pencabutan berlaku:
 *
 *   0    → validasi setiap request (paling ketat; 1 query per request ber-sesi)
 *   60   → default: pencabutan berlaku ≤60 detik, ~1 query per menit per sesi
 *   3600 → longgar (maksimum yang diterima)
 *
 * Nilai dibaca saat request (bukan saat modul dimuat) supaya bisa diatur
 * per-deployment dan di-stub oleh test.
 */
function sessionRevalidateMs(): number {
  const raw = Number(process.env.SESSION_REVALIDATE_SECONDS ?? '60');
  if (!Number.isFinite(raw) || raw < 0) return 60_000;
  return Math.min(raw, 3600) * 1000;
}

// --- OAuth account-linking policy (audit F-07 / F-19) ---
/**
 * Jalur OAuth (Google/GitHub) menautkan akun **berdasarkan email**, jadi aturan
 * di bawah ini adalah kontrol keamanannya:
 *
 * 1. **Email harus terverifikasi di provider.** Google mengirim klaim
 *    `email_verified`; GitHub tidak, jadi statusnya kami periksa sendiri lewat
 *    `GET /user/emails` memakai access token sesi OAuth itu (fail closed bila
 *    pemeriksaan gagal). Tanpa langkah ini, siapa pun yang bisa membuat klaim
 *    email di provider dapat masuk ke akun lokal dengan email tersebut.
 * 2. **Akun lokal yang punya 2FA tidak boleh masuk lewat OAuth.** Alur OAuth
 *    tidak melewati form kode TOTP milik `authorize()`, jadi membiarkannya
 *    berarti 2FA bisa dilewati hanya dengan menekan tombol Google/GitHub.
 *    Akun seperti itu diminta login dengan password + kode.
 * 3. Flag `allowDangerousEmailAccountLinking` **sengaja tidak dipasang**: tanpa
 *    adapter, NextAuth mengembalikan objek profil sebelum membaca flag itu
 *    (`core/lib/callback-handler.js`: `if (!adapter) return { user: profile }`),
 *    sehingga penautan nyatanya dilakukan callback `signIn` di bawah. Kalau
 *    kelak dipasang adapter, flag itu WAJIB tetap false — kalau tidak, NextAuth
 *    akan menautkan akun OAuth ke akun lokal hanya berdasar kesamaan email.
 */
const OAUTH_REDIRECT = {
  /** Provider tidak (atau belum) memverifikasi email tersebut. */
  emailNotVerified: '/auth/login?error=OAuthEmailNotVerified',
  /** Akun lokal memakai 2FA → wajib login dengan password + kode TOTP. */
  usePasswordLogin: '/auth/login?error=UsePasswordLogin',
} as const;

interface OAuthAccountLike {
  provider?: string;
  type?: string;
  access_token?: string;
}

/**
 * Apakah provider benar-benar memverifikasi `email`?
 *
 * - `google`: pakai klaim `email_verified` dari userinfo.
 * - `github`: NextAuth v4 hanya mengambil email primary dari `/user/emails`
 *   tanpa status `verified`, jadi kita periksa sendiri dengan token OAuth ini.
 *   Error jaringan/HTTP → `false` (fail closed) karena hasilnya menentukan
 *   apakah sebuah akun boleh ditautkan.
 * - Provider lain: `false` (jangan pernah menautkan tanpa bukti verifikasi).
 */
async function isProviderEmailVerified(
  account: OAuthAccountLike,
  profile: unknown,
  email: string
): Promise<boolean> {
  if (account.provider === 'google') {
    const claim = (profile as { email_verified?: unknown } | null)?.email_verified;
    return claim === true || claim === 'true';
  }

  if (account.provider === 'github') {
    const token = account.access_token;
    if (!token) return false;
    try {
      const res = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'anichin-oauth-verify',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return false;
      const list: unknown = await res.json();
      if (!Array.isArray(list)) return false;
      return list.some((entry) => {
        const item = entry as { email?: unknown; verified?: unknown };
        return (
          typeof item?.email === 'string' &&
          item.email.toLowerCase() === email &&
          item.verified === true
        );
      });
    } catch (err) {
      logger.error('[auth] gagal memverifikasi email GitHub:', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  return false;
}

// --- Email validation (server-side, no external deps) ---
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_RE.test(email);
}

// --- Resolve NEXTAUTH_SECRET (throw in production if missing) ---
// Cache only after first use, so the dev-only random fallback stays stable.
let resolvedSecret: string | undefined;

function resolveSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      // Hard fail in production — NEVER use a fallback secret for real users
      throw new Error(
        'NEXTAUTH_SECRET missing in production. Set a strong random secret (>=32 chars) via env var.'
      );
    }
    // Dev-only fallback — only works on localhost, NOT safe for any real traffic
    if (process.env.HOSTNAME && !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(process.env.HOSTNAME)) {
      throw new Error(
        'NEXTAUTH_SECRET missing for non-localhost host. Set the env var before running.'
      );
    }
    console.warn('[auth] WARNING: Using insecure dev-only NEXTAUTH_SECRET fallback. Set NEXTAUTH_SECRET env var for production.');
    return 'anichin-dev-secret-change-in-production-' + Math.random().toString(36).slice(2);
  }
  if (secret.length < 16) {
    throw new Error('NEXTAUTH_SECRET too short (min 16 chars).');
  }
  if (process.env.NODE_ENV === 'production') {
    validateAuthSecret(secret);
  }
  return secret;
}

/**
 * Validasi format client ID Google tanpa substring check.
 *
 * Client ID resmi berbentuk `<project-number>-<hash>.apps.googleusercontent.com`.
 * Pengecekan `.includes('.apps.googleusercontent.com')` tidak cukup: host asing
 * yang kebetulan memuat string itu (mis. `evil.example/apps.googleusercontent.com`)
 * juga lolos — temuan CodeQL `js/incomplete-url-substring-sanitization` (alert #3).
 * Di sini domain dibandingkan persis (equality), bukan sebagai substring.
 */
export function isGoogleClientId(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4 || !parts[0]) return false;
  return /^[0-9]{6,}-[a-z0-9_-]+$/i.test(parts[0]) && parts.slice(1).join('.') === 'apps.googleusercontent.com';
}

// Build providers array — OAuth providers only included if env vars set
function buildProviders() {
  // Validate production config at startup (fail fast)
  if (process.env.NODE_ENV === 'production') {
    const productionWarnings: string[] = [];
    if (!process.env.NEXTAUTH_URL?.startsWith('https://')) {
      productionWarnings.push('NEXTAUTH_URL must use HTTPS in production');
    }
    if (process.env.GOOGLE_CLIENT_ID && !isGoogleClientId(process.env.GOOGLE_CLIENT_ID)) {
      productionWarnings.push('GOOGLE_CLIENT_ID format looks invalid (expected .apps.googleusercontent.com suffix)');
    }
    if (process.env.GOOGLE_CLIENT_SECRET && !process.env.GOOGLE_CLIENT_SECRET.startsWith('GOCSPX-')) {
      productionWarnings.push('GOOGLE_CLIENT_SECRET format looks invalid (expected GOCSPX- prefix)');
    }
    if (productionWarnings.length > 0 && process.env.NEXT_PUBLIC_DEBUG_OAUTH === '1') {
      logger.warn('[auth] Production OAuth config warnings:', { warnings: productionWarnings });
    }
  }

  const providers: NextAuthOptions['providers'] = [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totp: { label: 'TOTP', type: 'text' }, // 2FA code (optional)
      },
      async authorize(credentials, req) {
        const email = (credentials?.email ?? '').trim().toLowerCase();
        const password = credentials?.password ?? '';
        const totp = (credentials?.totp ?? '').trim();

        // Extract client IP for attempt tracking.
        // Pakai resolver tepercaya (@/lib/ip): entri XFF paling KIRI dikirim
        // klien, jadi memakainya membuat login lockout bisa dilewati hanya
        // dengan mengarang header X-Forwarded-For.
        const ip = getClientIp(req);

        if (!email || !password) return null;
        if (!isValidEmail(email)) return null;
        if (password.length > 1024) return null; // hard cap to prevent DoS

        // Check lockout (Redis-backed, async)
        if (await isAccountLocked(email, ip)) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            emailVerified: true,
            twoFactorEnabled: true,
            twoFactorSecret: true,
          },
        });

        if (!user) {
          await recordFailedAttempt(email, ip);
          return null;
        }

        const isValid = compareSync(password, user.password);
        if (!isValid) {
          await recordFailedAttempt(email, ip);
          return null;
        }

        // Passwords are not a proof of mailbox ownership. This also blocks
        // legacy accounts that were created before verification was required.
        if (!user.emailVerified) {
          await recordFailedAttempt(email, ip);
          return null;
        }

        // --- 2FA check (if enabled) ---
        //
        // Verifikasi TOTP dilakukan DI SINI — satu-satunya tempat, dan selalu
        // di dalam alur yang sudah melewati lockout (`isAccountLocked` di atas)
        // serta mencatat kegagalan (sehingga brute-force kode 6 digit dibatasi
        // 5 percobaan / 15 menit per email+IP). Endpoint /api/auth/2fa/verify
        // sengaja TIDAK memverifikasi kode (dulu ia melakukannya, sehingga
        // penyerang bisa memvalidasi kode di luar lockout). Halaman login
        // memakai endpoint itu hanya untuk tahu kapan harus menampilkan input
        // kode 2FA.
        // Dua jenis faktor diterima di sini:
        //   1. kode TOTP 6 digit dari authenticator app,
        //   2. kode cadangan `XXXXX-XXXXX` — sekali pakai, untuk pengguna yang
        //      kehilangan authenticator (F-10: kode kini benar-benar disimpan
        //      sebagai hash bcrypt, lihat src/lib/two-factor-backup.ts).
        // Keduanya diverifikasi di jalur INI saja (di dalam lockout + dicatat
        // sebagai kegagalan), jadi tidak ada cara memvalidasi kode di luar alur
        // login. Akun dengan `twoFactorEnabled` tapi tanpa secret tetap
        // diwajibkan faktor kedua (fail closed), tidak lagi dilewatkan.
        if (user.twoFactorEnabled) {
          if (!totp) {
            // Sinyal ke klien: bukan salah password, tetapi butuh langkah 2FA.
            throw new Error('2FA_REQUIRED');
          }

          let secondFactorOk = false;

          // (1) TOTP — hanya bila bentuknya 6 digit dan secretnya tersedia.
          if (/^\d{6}$/.test(totp) && user.twoFactorSecret) {
            try {
              secondFactorOk = verifyTwoFactorToken(
                totp,
                decryptSecret(user.twoFactorSecret)
              );
            } catch {
              // Dekripsi gagal (key salah / data rusak) → anggap gagal.
              secondFactorOk = false;
            }
          }

          // (2) Kode cadangan sekali pakai (dikonsumsi secara atomik di DB).
          if (!secondFactorOk && isBackupCode(totp)) {
            try {
              secondFactorOk = await consumeBackupCode(user.id, totp);
              if (secondFactorOk) {
                logger.warn('[auth] login memakai kode cadangan 2FA', {
                  userId: user.id,
                });
              }
            } catch (err) {
              // DB bermasalah saat mengonsumsi kode → fail closed.
              logger.error('[auth] gagal mengonsumsi kode cadangan 2FA:', {
                error: err instanceof Error ? err.message : String(err),
              });
              secondFactorOk = false;
            }
          }

          if (!secondFactorOk) {
            await recordFailedAttempt(email, ip);
            return null;
          }
        }

        // Success — clear attempts
        await clearAttempts(email, ip);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as 'user' | 'admin',
        };
      },
    }),
  ];

  // Google OAuth (only if configured)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // TIDAK memakai `allowDangerousEmailAccountLinking` — lihat blok
        // "OAuth account-linking policy" di atas: penautan dilakukan callback
        // `signIn` yang mensyaratkan email terverifikasi di provider.
      })
    );
  }

  // GitHub OAuth (only if configured)
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        // Idem: tanpa flag penautan "dangerous"; verifikasi email GitHub
        // diperiksa sendiri di isProviderEmailVerified().
      })
    );
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  session: {
    strategy: 'jwt',
    // Session cookie expires in 30 days (rolling — activity refreshes)
    maxAge: 30 * 24 * 60 * 60,
    // Re-check session validity every 24h (for HTTP requests)
    updateAge: 24 * 60 * 60,
  },
  jwt: {
    // JWT absolute max age (forces re-auth after 7 days of no activity beyond session)
    maxAge: 7 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
    newUser: '/auth/register',
  },
  /**
   * Nama cookie TIDAK boleh ditulis manual di sini — semuanya dari
   * `@/lib/auth-cookies` supaya sama persis dengan yang dicari `getToken()`
   * di `src/proxy.ts` dan `src/lib/session.ts`. Sebelumnya nama tanpa prefix
   * dipakai di produksi sementara `getToken()` mencari `__Secure-...` sehingga
   * `/admin` selalu dianggap belum login (F-18 di docs/SECURITY-AUDIT.md).
   */
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: cookieOptions(),
    },
    callbackUrl: {
      name: CALLBACK_URL_COOKIE_NAME,
      options: cookieOptions(),
    },
    csrfToken: {
      name: CSRF_COOKIE_NAME,
      options: cookieOptions(),
    },
    pkceCodeVerifier: {
      name: PKCE_COOKIE_NAME,
      options: { ...cookieOptions(), maxAge: 60 * 15 },
    },
  },
  useSecureCookies: USE_SECURE_COOKIES,
  callbacks: {
    /**
     * Kebijakan penautan/pembuatan akun lewat OAuth (Google/GitHub).
     *
     * Mengembalikan `true` untuk melanjutkan, atau URL (string) untuk menolak
     * dengan kode error yang bisa ditampilkan halaman login — NextAuth
     * mengalihkan ke URL itu (lihat `core/routes/callback.js`).
     */
    async signIn({ user, account, profile }) {
      const oauthAccount = (account ?? {}) as OAuthAccountLike;

      // Kredensial (email + password) tidak melewati kebijakan penautan ini —
      // password sudah diverifikasi di `authorize()`. Selain kredensial,
      // SEMUA jalur diperlakukan sebagai OAuth (fail closed): provider OIDC
      // yang ditambahkan kelak tidak otomatis lolos hanya karena `type`-nya
      // bukan "oauth", dan provider asing langsung ditolak oleh
      // isProviderEmailVerified() di bawah.
      if (!oauthAccount.provider || oauthAccount.provider === 'credentials' || oauthAccount.type === 'credentials') {
        return true;
      }

      const email = (user?.email ?? '').trim().toLowerCase();
      if (!email) {
        logger.warn('[auth] OAuth ditolak: provider tidak mengirim email', {
          provider: oauthAccount.provider,
        });
        return OAUTH_REDIRECT.emailNotVerified;
      }

      // 1. Email harus terverifikasi di provider (lihat catatan OAUTH_REDIRECT).
      if (!(await isProviderEmailVerified(oauthAccount, profile, email))) {
        logger.warn('[auth] OAuth ditolak: email belum terverifikasi di provider', {
          provider: oauthAccount.provider,
        });
        return OAUTH_REDIRECT.emailNotVerified;
      }

      try {
        const existing = await db.user.findUnique({
          where: { email },
          select: { id: true, twoFactorEnabled: true, emailVerified: true },
        });

        if (existing) {
          // 2. 2FA tidak boleh dilewati lewat OAuth.
          if (existing.twoFactorEnabled) {
            logger.warn('[auth] OAuth ditolak: akun memakai 2FA', { provider: oauthAccount.provider });
            return OAUTH_REDIRECT.usePasswordLogin;
          }

          // Provider membuktikan kepemilikan email. Jika akun lokal belum
          // terverifikasi (termasuk akun legacy), jangan pertahankan password
          // yang mungkin dipilih oleh orang yang lebih dulu mengklaim email itu:
          // rotasi password acak yang tidak diketahui dan cabut seluruh sesi.
          if (!existing.emailVerified) {
            await db.user.update({
              where: { id: existing.id },
              data: {
                emailVerified: new Date(),
                password: hashSync(randomBytes(32).toString('hex'), 10),
                sessionVersion: { increment: 1 },
              },
            });
          }
          return true;
        }

        // 3. Akun baru — hanya dibuat karena provider memverifikasi email itu.
        await db.user.create({
          data: {
            email,
            name: sanitizeDisplayName(user.name ?? email.split('@')[0]),
            avatar: user.image ?? null,
            password: hashSync(randomBytes(32).toString('hex'), 10), // password acak (tak dipakai)
            role: 'user',
            emailVerified: new Date(), // diverifikasi provider pada langkah 1
          },
        });
        return true;
      } catch (err) {
        // Balapan dua login OAuth bersamaan: baris sudah dibuat proses lain →
        // aman untuk melanjutkan (jwt callback memuat identitas dari DB).
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
          return true;
        }
        // Error lain (DB bermasalah) → tolak: fail closed. Token tanpa identitas
        // tidak berguna, dan tidak ada akun yang dibuat setengah jalan.
        logger.error('[auth] OAuth sign-in gagal:', {
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    },
    async jwt({ token, user, trigger }) {
      const t = token as {
        id?: string;
        role?: 'user' | 'admin';
        name?: string | null;
        email?: string;
        /** sessionVersion saat token ini diterbitkan / terakhir divalidasi. */
        sv?: number;
        /** Kapan terakhir divalidasi ke DB (epoch ms) — pembatas frekuensi query. */
        svCheckedAt?: number;
      };

      // ── 1. Login pertama: identitas diambil dari DB (sumber kebenaran) ──
      //
      // Sebelumnya nilai diambil dari objek `user` yang diberikan provider. Untuk
      // OAuth (tanpa adapter) objek itu adalah profil provider: `id`-nya id akun
      // di Google/GitHub (bukan id baris `User` kita) dan `role` tidak ada —
      // akibatnya user OAuth login tanpa `id`/`role` yang benar (komentar/ulasan
      // gagal, dan sesi tidak bisa dicabut karena token tidak memuat penanda).
      // Sekarang: cari user di DB berdasarkan email, lalu salin id/role/name +
      // `sessionVersion` ke token. Kredensial tetap jalan (email sudah ada).
      if (user) {
        const u = user as {
          id?: string;
          role?: 'user' | 'admin';
          name?: string | null;
          email?: string;
        };
        const email = u.email?.trim().toLowerCase();

        let identity: {
          id: string;
          role: string;
          name: string;
          sessionVersion: number;
          emailVerified: Date | null;
        } | null = null;

        if (email) {
          try {
            identity = await db.user.findUnique({
              where: { email },
              select: { id: true, role: true, name: true, sessionVersion: true, emailVerified: true },
            });
          } catch (err) {
            // Fail closed: without a DB identity we cannot prove the account is
            // still verified or that its current role/session version is valid.
            logger.error('[auth] gagal memuat identitas user saat login:', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (!identity?.emailVerified) {
          t.id = undefined;
          t.role = undefined;
          t.name = null;
          t.email = undefined;
          t.sv = undefined;
          t.svCheckedAt = Date.now();
          return token;
        }

        t.id = identity.id;
        t.role = identity.role as 'user' | 'admin';
        t.name = identity.name ?? u.name ?? t.name;
        t.email = email ?? u.email ?? t.email;
        t.sv = identity.sessionVersion;
        t.svCheckedAt = Date.now();
        return token;
      }

      // ── 2. Request berikutnya: validasi berkala + pencabutan sesi ──
      //
      // `sessionVersion` dinaikkan saat password direset / role diubah admin,
      // dan baris `User` hilang saat akun dihapus. Token dengan `sv` lama (atau
      // yang usernya sudah tidak ada) dicabut di sini — bukan menunggu JWT
      // kedaluwarsa (dulu sampai 7 hari).
      if (t.id) {
        const due =
          trigger === 'update' || Date.now() - (t.svCheckedAt ?? 0) >= sessionRevalidateMs();

        if (due) {
          try {
            const fresh = await db.user.findUnique({
              where: { id: t.id },
              select: { id: true, role: true, name: true, sessionVersion: true, emailVerified: true },
            });

            // `t.sv === undefined` = token yang diterbitkan sebelum fitur ini ada
            // (atau saat DB sempat error) → adopsi nilai DB (trust on first use);
            // token berikutnya selalu punya penanda.
            const revoked =
              !fresh ||
              !fresh.emailVerified ||
              (t.sv !== undefined && fresh.sessionVersion !== t.sv);

            if (revoked) {
              t.id = undefined;
              t.role = undefined;
              t.sv = undefined;
              t.name = null;
              t.email = undefined;
            } else {
              t.role = fresh.role as 'user' | 'admin';
              t.name = fresh.name;
              t.sv = fresh.sessionVersion;
            }
            t.svCheckedAt = Date.now();
          } catch (err) {
            // DB error: token DIPERTAHANKAN (fail open) — kalau tidak, gangguan
            // DB sesaat akan menulis ulang cookie semua pengguna menjadi token
            // kosong alias logout massal permanen. `svCheckedAt` juga tidak
            // diperbarui, jadi request berikutnya mencoba validasi lagi.
            logger.error('[auth] validasi ulang sesi gagal:', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as { id?: string; role?: 'user' | 'admin'; name?: string | null };
      const s = session as unknown as {
        user?: { id: string; name: string; email: string; image?: string | null; role: 'user' | 'admin' };
      };
      // Sesi dicabut (password/role berubah atau akun dihapus) → jangan laporkan
      // user apa pun.
      //
      // Objek yang dikembalikan SENGAJA kosong setelah serialisasi (`{}`):
      // SDK klien (`fetchData` di next-auth/client/_utils) mengembalikan `null`
      // bila body JSON tidak punya kunci sama sekali, sehingga SessionProvider
      // menandai status "unauthenticated" dan UI langsung menganggap logout —
      // bukan "authenticated tapi usernya kosong".
      if (!t.id || !t.role) {
        return { user: undefined, expires: undefined } as unknown as typeof session;
      }
      if (s.user) {
        s.user.id = t.id;
        s.user.role = t.role;
        s.user.name = sanitizeDisplayName(s.user.name ?? t.name ?? 'Anonim');
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Compare parsed origins, never string prefixes (`https://site.evil` must
      // not pass for `https://site`). Protocol-relative URLs are external too.
      try {
        const base = new URL(baseUrl);
        const destination = new URL(url, base);
        if (
          destination.origin === base.origin &&
          !destination.username &&
          !destination.password
        ) {
          return destination.toString();
        }
      } catch {
        // Malformed URLs fall back to the canonical base.
      }
      return baseUrl;
    },
  },
  // Next.js imports routes while collecting page data, without runtime secrets.
  // NextAuth reads this property when handling a request (or a server session),
  // so production validation still applies without baking secrets into images.
  get secret(): string {
    return resolvedSecret ??= resolveSecret();
  },
  // Don't leak error details to client
  logger: {
    error(error) {
      // Log server-side only (audit log handles persistence)
      // In dev, console.error is fine; in prod, route to monitoring
      if (process.env.NODE_ENV !== 'production') {
        logger.error('[next-auth]', { error: String(error) });
      }
    },
    warn(code) {
      if (process.env.NODE_ENV !== 'production') {
        logger.warn('[next-auth]', { code: String(code) });
      }
    },
  },
  events: {
    async signIn({ user }) {
      // Could log to audit-log here in future
      if (process.env.NODE_ENV !== 'production') {
        logger.info('[auth] sign-in', { email: user.email ?? 'unknown' });
      }
    },
  },
};

export { hashSync, compareSync, isValidEmail };
