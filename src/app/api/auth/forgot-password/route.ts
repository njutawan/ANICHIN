import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

/**
 * POST /api/auth/forgot-password
 *
 * Request a password reset link.
 *
 * Security:
 * - Anti-enumeration: always returns 200 (even if email doesn't exist)
 * - Rate limited: expensive tier (10/min)
 * - Generates a PasswordReset token (1h expiry)
 * - Sends email via SMTP (if configured) — otherwise logs
 *
 * In production with SMTP configured, this sends a real reset email.
 * In dev, the URL is returned so testing is possible.
 */

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const body = await req.json();
    const { email } = body as { email?: string };

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email wajib diisi.' }, { status: 400 });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists (but don't reveal to client)
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true },
    });

    if (user) {
      // Generate reset token
      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Delete previous unused tokens for this user
      await db.passwordReset.deleteMany({
        where: { userId: user.id, usedAt: null },
      });

      // Create new token
      await db.passwordReset.create({
        data: {
          token,
          userId: user.id,
          expiresAt,
        },
      });

      // Build reset URL
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

      // Send email (or log in dev)
      const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

      if (hasSmtp) {
        try {
          // Send reset email via SMTP (reuse email.ts sendVerificationEmail pattern)
          const { sendVerificationEmail } = await import('@/lib/email');
          await sendVerificationEmail(normalizedEmail, resetUrl);
          logger.info('[forgot-password] Reset email sent', { userId: user.id });
        } catch (err) {
          logger.error('[forgot-password] Email send failed', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      } else {
        logger.info('[forgot-password] Reset URL (no SMTP)', { resetUrl });
      }
    }

    // Always return success (anti-enumeration)
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[forgot-password] Error', {
      error: err instanceof Error ? err.message : String(err)
    });
    // Still return success (anti-enumeration)
    return NextResponse.json({ success: true });
  }
}
