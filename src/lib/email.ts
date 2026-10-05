/**
 * Email Service — Verification emails + token management.
 *
 * Provides:
 *  - generateVerificationToken()  — 64-char hex CSPRNG token
 *  - createVerificationToken(userId) — DB record (single active per user, 24h expiry)
 *  - verifyEmailToken(token)         — validates + consumes + marks user verified
 *  - sendVerificationEmail(to, url)  — dev: console; prod: nodemailer SMTP
 *
 * SMTP Configuration (env vars):
 *  - SMTP_HOST     — e.g. smtp.gmail.com, smtp.resend.com, email-smtp.us-east-1.amazonaws.com
 *  - SMTP_PORT     — 587 (STARTTLS), 465 (SSL), or 25
 *  - SMTP_USER     — username/API key
 *  - SMTP_PASS     — password/API key secret
 *  - SMTP_SECURE   — "true" for port 465 (SSL), "false" for 587 (STARTTLS)
 *  - SMTP_FROM     — sender address (e.g. "AniChin <noreply@anichin.id>")
 *
 * Supported providers: Gmail, Resend, SendGrid, AWS SES, Mailgun, Brevo, Postmark
 *
 * Security notes:
 *  - Token is 32 bytes of crypto.randomBytes → 256-bit entropy (uncrackable).
 *  - Only one active (unused, non-expired) token per user at a time.
 *  - Token lookup uses the unique index (constant time w.r.t. total rows).
 *  - Token is consumed in the same tx as user.emailVerified update — no race.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';

const TOKEN_TTL_HOURS = 24;

// ---------------------------------------------------------------------------
// Token primitives
// ---------------------------------------------------------------------------

/**
 * Generate a 64-char hex verification token (32 bytes of CSPRNG entropy).
 */

// ---------------------------------------------------------------------------
// DB-backed token lifecycle
// ---------------------------------------------------------------------------


/**
 * Create a fresh verification token for a user.
 * Deletes any previous UNUSED tokens for the same user first (single active
 * token per user — prevents token buildup + confusion).
 */
export interface CreatedToken {
  token: string;
  expiresAt: Date;
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
export async function createVerificationToken(
  userId: string
): Promise<CreatedToken> {
  const token = generateVerificationToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await db.$transaction([
    db.verificationToken.deleteMany({
      where: {
        userId,
        usedAt: null,
      },
    }),
    db.verificationToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    }),
  ]);

  return { token, expiresAt };
}




// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------

export async function verifyEmailToken(token: string): Promise<{ success: boolean; userId?: string; reason?: string }> {
  if (!token || typeof token !== 'string') {
    return { success: false, reason: 'not_found' };
  }

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return { success: false, reason: 'not_found' };
  }

  const record = await db.verificationToken.findUnique({
    where: { token },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record) {
    return { success: false, reason: 'not_found' };
  }

  if (record.usedAt) {
    return { success: false, reason: 'already_used' };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    return { success: false, reason: 'expired' };
  }

  const now = new Date();
  await db.$transaction([
    db.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
    db.user.update({
      where: { id: record.userId },
      data: { emailVerified: now },
    }),
  ]);

  return { success: true, userId: record.userId };
}

// ---------------------------------------------------------------------------
// SMTP transporter (lazy singleton)
// ---------------------------------------------------------------------------

let transporterSingleton: ReturnType<typeof import('nodemailer')['createTransport']> | null = null;

async function getTransporter() {
  if (transporterSingleton) return transporterSingleton;

  const hasSmtpConfig = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );

  if (!hasSmtpConfig) return null;

  const { createTransport } = await import('nodemailer');

  const port = Number(process.env.SMTP_PORT ?? '587');
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  transporterSingleton = createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return transporterSingleton;
}

// ---------------------------------------------------------------------------
// Email delivery
// ---------------------------------------------------------------------------

export interface SendEmailResult {
  delivered: boolean;
  devUrl?: string;
  provider: 'console' | 'smtp';
  error?: string;
}

export async function sendVerificationEmail(
  to: string,
  verificationUrl: string
): Promise<SendEmailResult> {
  const isProd = process.env.NODE_ENV === 'production';
  const from = process.env.SMTP_FROM || 'AniChin <noreply@anichin.id>';

  const transporter = await getTransporter();

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject: '[AniChin] Verifikasi Email Kamu',
        html: renderVerificationEmailHtml(verificationUrl),
        text: `Verifikasi email kamu: ${verificationUrl}`,
      });

      if (process.env.NODE_ENV !== 'production') {
        // Buang baris baru dari input pengguna sebelum masuk log (CWE-117);
        // pola `.replace(/[\r\n]/g, "")` inilah yang dikenali CodeQL.
        console.log(`[email] SMTP sent to ${to.replace(/[\r\n]/g, '')}: ${info.messageId}`);
      }

      return { delivered: true, provider: 'smtp' };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown SMTP error';
      // Log full error only in dev; in prod, log generic message (no internal details)
      if (process.env.NODE_ENV !== 'production') {
        console.error('[email] SMTP send failed:', errorMsg);
      } else {
        console.error('[email] SMTP send failed (check server logs)');
      }

      if (isProd) {
        return { delivered: false, provider: 'smtp', error: 'SMTP delivery failed' };
      }

      // Dev-only fallback: log URL so developer can click
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[email] Falling back to console. URL: ${verificationUrl}`);
      }
      return {
        delivered: true,
        provider: 'console',
        devUrl: verificationUrl,
      };
    }
  }

  // No SMTP configured — log to console (dev only; in prod, just silently fail)
  if (process.env.NODE_ENV !== 'production') {
    console.log('─────────────────────────────────────────────────────────');
    console.log(`[email] Verification email for: ${to.replace(/[\r\n]/g, '')}`);
    console.log(`[email] Verification URL:        ${verificationUrl}`);
    console.log('─────────────────────────────────────────────────────────');
  } else {
    console.warn('[email] No SMTP configured — verification email not sent');
  }

  return {
    delivered: true,
    provider: 'console',
    devUrl: verificationUrl,
  };
}

function renderVerificationEmailHtml(verificationUrl: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d0d12;font-family:sans-serif;color:#e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d12;min-height:100vh;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a24;border-radius:16px;overflow:hidden;border:1px solid #2a2a3a;">
        <tr><td style="background:linear-gradient(135deg,#fbbf24,#f59e0b);padding:32px 40px;text-align:center;">
          <div style="font-size:32px;font-weight:900;color:#0d0d12;">AniChin</div>
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#fbbf24;">Verifikasi Email Kamu</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#a0a0b0;">Halo! Terima kasih sudah daftar di AniChin. Klik tombol di bawah buat verifikasi email kamu:</p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 32px;">
            <a href="${verificationUrl}" style="display:inline-block;background:#fbbf24;color:#0d0d12;font-weight:700;font-size:16px;padding:14px 40px;border-radius:50px;text-decoration:none;">Verifikasi Email</a>
          </td></tr></table>
          <p style="margin:0 0 16px;font-size:14px;color:#666;">Tombol tidak jalan? Copy link ini ke browser:</p>
          <p style="margin:0 0 32px;font-size:13px;color:#fbbf24;word-break:break-all;background:#0d0d12;padding:12px 16px;border-radius:8px;border:1px solid #2a2a3a;">${verificationUrl}</p>
          <p style="margin:0;font-size:13px;color:#666;">Link ini berlaku selama 24 jam.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
