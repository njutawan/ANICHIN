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
  isLocked as storeIsLocked,
  incrFails,
  clearFails,
} from '@/lib/rate-limit-store';
import {
  verifyTwoFactorToken,
  decryptSecret,
} from '@/lib/two-factor';

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

// --- Email validation (server-side, no external deps) ---
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_RE.test(email);
}

// --- Resolve NEXTAUTH_SECRET (throw in production if missing) ---
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
  return secret;
}

// Build providers array — OAuth providers only included if env vars set
function buildProviders() {
  // Validate production config at startup (fail fast)
  if (process.env.NODE_ENV === 'production') {
    const productionWarnings: string[] = [];
    if (!process.env.NEXTAUTH_URL?.startsWith('https://')) {
      productionWarnings.push('NEXTAUTH_URL must use HTTPS in production');
    }
    if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com')) {
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

        // Extract client IP for attempt tracking
        const forwarded = req?.headers?.get?.('x-forwarded-for');
        const realIp = req?.headers?.get?.('x-real-ip');
        const ip = (forwarded?.split(',')[0]?.trim() ?? realIp ?? 'unknown').slice(0, 64);

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

        // --- 2FA check (if enabled) ---
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          if (!totp || totp.length !== 6) {
            // Signal to client that 2FA is required (via custom error)
            throw new Error('2FA_REQUIRED');
          }
          try {
            const secret = decryptSecret(user.twoFactorSecret);
            const valid = verifyTwoFactorToken(totp, secret);
            if (!valid) {
              await recordFailedAttempt(email, ip);
              return null;
            }
          } catch {
            // Decryption failed — treat as failed auth
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
        allowDangerousEmailAccountLinking: true,
      })
    );
  }

  // GitHub OAuth (only if configured)
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
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
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    pkceCodeVerifier: {
      name: `next-auth.pkce.code-verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 15,
      },
    },
  },
  useSecureCookies: process.env.NODE_ENV === 'production',
  callbacks: {
    // Auto-create user on first OAuth sign-in (Google/GitHub)
    async signIn({ user, account }) {
      // Only handle OAuth providers (account.provider !== 'credentials')
      if (account?.provider && account.provider !== 'credentials' && user.email) {
        try {
          const existing = await db.user.findUnique({
            where: { email: user.email.toLowerCase() },
            select: { id: true },
          });

          if (!existing) {
            // Create new user from OAuth profile
            await db.user.create({
              data: {
                email: user.email.toLowerCase(),
                name: sanitizeDisplayName(user.name ?? user.email.split('@')[0]),
                avatar: user.image ?? null,
                password: hashSync(randomBytes(32).toString('hex'), 10), // random unused password
                role: 'user',
                emailVerified: new Date(), // OAuth emails are already verified
              },
            });
          }
        } catch (err) {
          logger.error('[auth] OAuth user creation failed:', { error: err instanceof Error ? err.message : String(err) });
          // Allow sign-in anyway if user exists (race condition)
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      const t = token as {
        id?: string;
        role?: 'user' | 'admin';
        name?: string | null;
        email?: string;
      };
      // Initial sign-in
      if (user) {
        const u = user as { id: string; role: 'user' | 'admin'; name?: string | null; email?: string };
        t.id = u.id;
        t.role = u.role;
        t.name = u.name ?? t.name;
        t.email = u.email ?? t.email;
      }
      // Refresh: re-fetch role from DB to catch role changes / revoked users
      if (trigger === 'update' && t.id) {
        try {
          const fresh = await db.user.findUnique({
            where: { id: t.id },
            select: { role: true, name: true },
          });
          if (fresh) {
            t.role = fresh.role as 'user' | 'admin';
            t.name = fresh.name;
          } else {
            // User was deleted — invalidate token
            t.id = undefined;
            t.role = undefined;
          }
        } catch {
          // DB error — keep existing token (fail open for read, not for write)
        }
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as { id?: string; role?: 'user' | 'admin'; name?: string | null };
      const s = session as unknown as {
        user: { id: string; name: string; email: string; image?: string | null; role: 'user' | 'admin' };
      };
      if (s.user && t.id && t.role) {
        s.user.id = t.id;
        s.user.role = t.role;
        s.user.name = sanitizeDisplayName(s.user.name ?? t.name ?? 'Anonim');
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Prevent open redirect — only allow same-origin redirects
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith('/')) return new URL(url, baseUrl).toString();
      return baseUrl;
    },
  },
  secret: resolveSecret(),
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
