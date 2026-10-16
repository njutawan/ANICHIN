import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { isValidEmail } from '@/lib/auth';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { createVerificationToken, sendVerificationEmail } from '@/lib/email';

/**
 * POST /api/auth/send-verification
 *
 * Public, anti-enumeration resend endpoint: users cannot log in before proving
 * mailbox ownership, so the verification link must be requestable without a
 * session. Unknown/already-verified addresses receive the same HTTP response.
 */
export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > 4096) {
      return NextResponse.json({ error: 'Payload terlalu besar.' }, { status: 413 });
    }

    const limited = await checkRateLimit(req, 'auth');
    if (limited) return limited;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Format request tidak valid.' }, { status: 400 });
    }

    const email = (body as { email?: unknown } | null)?.email;
    if (typeof email !== 'string' || !isValidEmail(email.trim().toLowerCase())) {
      return NextResponse.json({ error: 'Format email tidak valid.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerified: true },
    });

    let devUrl: string | undefined;
    if (user && !user.emailVerified) {
      try {
        const { token } = await createVerificationToken(user.id);
        const baseUrl = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin;
        const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
        const result = await sendVerificationEmail(user.email, verificationUrl);
        if (!result.delivered) {
          logger.warn('[send-verification] email delivery failed');
        } else if (process.env.NODE_ENV !== 'production') {
          devUrl = result.devUrl;
        }
      } catch (err) {
        // Do not reveal account existence or token details to the caller.
        logger.warn('[send-verification] failed to create/send verification email', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const payload: { sent: true; devUrl?: string } = { sent: true };
    if (devUrl) payload.devUrl = devUrl;
    return addRateLimitHeaders(NextResponse.json(payload, { status: 200 }), 'auth');
  } catch (err) {
    logger.error('[send-verification] Unexpected error:', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Gagal mengirim email verifikasi. Coba lagi.' }, { status: 500 });
  }
}
