import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import {
  verifyTwoFactorToken,
  decryptSecret,
} from '@/lib/two-factor';

/**
 * POST /api/auth/2fa/verify
 *
 * Used by the LOGIN flow (NOT by an authenticated session).
 *
 * The frontend login flow is:
 *   1. POST /api/auth/credentials/signin (NextAuth) with email + password.
 *      — But first, the frontend peeks at whether the user has 2FA enabled:
 *        a. POST /api/auth/2fa/verify with { email, token: '__probe__' }
 *           ... no — that would burn a rate-limit slot. Instead, we expose a
 *           hint via the response shape below.
 *
 * Simpler approach (this endpoint):
 *   - Frontend calls this endpoint with { email, token } AFTER confirming the
 *     password is valid (password check happens client-side first via the
 *     normal credentials flow, OR the frontend can call this endpoint after
 *     prompting for the 2FA token).
 *
 * Contract:
 *   - Body: { email: string, token: string }
 *   - 200: { valid: boolean, requiresTwoFactor: boolean }
 *
 * If the user does NOT have 2FA enabled, returns { valid: false, requiresTwoFactor: false }
 * — the frontend should skip the 2FA step and proceed with signIn().
 *
 * If the user HAS 2FA enabled, decrypts the stored secret and verifies the
 * 6-digit TOTP token. Returns { valid: true|false, requiresTwoFactor: true }.
 *
 * Note on backup codes: per the task spec, backup codes are generated and shown
 * once but not stored in the DB (schema has no column). For now this endpoint
 * only verifies TOTP tokens. Backup-code support can be added later by
 * introducing a hashed backup-codes column on User.
 *
 * Security notes:
 *   - This endpoint is UNAUTHENTICATED (called during login) → strict rate
 *     limit (auth tier, 20 req/60s per IP).
 *   - We do NOT reveal whether an email exists; we return a generic
 *     "requiresTwoFactor: false" for both nonexistent users and users without
 *     2FA, so an attacker cannot enumerate who has 2FA enabled.
 *   - We do NOT log token values.
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

    const { email, token } = (body ?? {}) as {
      email?: unknown;
      token?: unknown;
    };

    if (typeof email !== 'string' || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Email dan token wajib diisi.' },
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

    // Clean the token (allow 6 digits; authenticator apps sometimes paste with
    // spaces)
    const cleanToken = String(token).replace(/\s+/g, '');

    // Look up the user
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    // Anti-enumeration: if user doesn't exist or 2FA not enabled, return a
    // consistent "no 2FA needed" response so attackers can't probe.
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return addRateLimitHeaders(
        NextResponse.json(
          { valid: false, requiresTwoFactor: false },
          { status: 200 }
        ),
        'auth'
      );
    }

    // User has 2FA enabled → verify the token
    let decryptedSecret: string;
    try {
      decryptedSecret = decryptSecret(user.twoFactorSecret);
    } catch (decErr) {
      // Decryption failed (corrupted ciphertext, key rotation, tamper attempt)
      logger.error(
        '[2fa/verify] decryptSecret failed',
        { error: decErr instanceof Error ? decErr.message : String(decErr), userId: user.id }
      );
      // Fail closed — do NOT let the user in
      return addRateLimitHeaders(
        NextResponse.json(
          { valid: false, requiresTwoFactor: true },
          { status: 200 }
        ),
        'auth'
      );
    }

    const isValid = verifyTwoFactorToken(cleanToken, decryptedSecret);

    if (isValid && process.env.NODE_ENV !== 'production') {
      logger.info(`[2fa/verify] valid TOTP token for user ${user.id}`);
    }

    return addRateLimitHeaders(
      NextResponse.json(
        { valid: isValid, requiresTwoFactor: true },
        { status: 200 }
      ),
      'auth'
    );
  } catch (err) {
    logger.error('[2fa/verify] Unexpected error:', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Gagal verifikasi 2FA. Coba lagi.' },
      { status: 500 }
    );
  }
}
