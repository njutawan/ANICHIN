/**
 * Regresi untuk kebocoran token email (audit keamanan).
 *
 * Temuan: `sendVerificationEmail` mengembalikan `devUrl` (URL berisi token)
 * pada fallback console TANPA memeriksa NODE_ENV, sehingga
 * `POST /api/auth/send-verification` membalas token verifikasi ke pemanggil
 * walau aplikasi berjalan di produksi tanpa SMTP.
 *
 * Aturan yang dikunci di sini:
 *   - produksi + tanpa SMTP  → delivered:false, TANPA devUrl, token tidak di-log
 *   - non-produksi + no SMTP → delivered:true + devUrl (agar QA bisa klik)
 *
 * `@/lib/db` di-mock supaya modul bisa diimpor tanpa Prisma client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

const RESET_URL = 'https://anichin.id/auth/reset-password?token=' + 'a'.repeat(64);
const VERIFY_URL = 'https://anichin.id/api/auth/verify-email?token=' + 'b'.repeat(64);

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const;

beforeEach(() => {
  vi.resetModules();
  // Tidak ada SMTP: paksa jalur fallback console.
  for (const key of SMTP_KEYS) vi.stubEnv(key, '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('deliverEmail() lewat sendVerificationEmail/sendPasswordResetEmail', () => {
  it('produksi tanpa SMTP: tidak mengembalikan devUrl dan tidak mengklaim terkirim', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { sendVerificationEmail } = await import('@/lib/email');

    const result = await sendVerificationEmail('user@example.com', VERIFY_URL);

    expect(result.delivered).toBe(false);
    expect(result.devUrl).toBeUndefined();
    // Token tidak boleh muncul di stdout/stderr (log produksi).
    const logged = [
      ...(console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls,
      ...(console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls,
      ...(console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    ]
      .flat()
      .join(' ');
    expect(logged).not.toContain('verify-email?token=');
  });

  it('produksi tanpa SMTP: email reset password juga tanpa devUrl', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { sendPasswordResetEmail } = await import('@/lib/email');

    const result = await sendPasswordResetEmail('user@example.com', RESET_URL);

    expect(result.delivered).toBe(false);
    expect(result.devUrl).toBeUndefined();
  });

  it('non-produksi tanpa SMTP: devUrl tetap tersedia untuk QA', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { sendVerificationEmail, sendPasswordResetEmail } = await import('@/lib/email');

    const verify = await sendVerificationEmail('user@example.com', VERIFY_URL);
    const reset = await sendPasswordResetEmail('user@example.com', RESET_URL);

    expect(verify).toMatchObject({ delivered: true, provider: 'console', devUrl: VERIFY_URL });
    expect(reset).toMatchObject({ delivered: true, provider: 'console', devUrl: RESET_URL });
  });
});
