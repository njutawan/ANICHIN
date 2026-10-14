/**
 * Regresi audit: token reset password tidak boleh masuk log produksi, dan
 * respons tetap anti-enumeration.
 *
 * Temuan: saat SMTP belum dikonfigurasi, route ini selalu
 * `logger.info('[forgot-password] Reset URL (no SMTP)', { resetUrl })` — di
 * produksi itu berarti token reset (berlaku 1 jam, sekali pakai) tertulis ke
 * stdout/Docker logs; siapa pun yang bisa membaca log bisa mereset password
 * semua akun yang meminta reset (CWE-532).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { dbMock, loggerMock, checkRateLimitMock, emailMock } = vi.hoisted(() => ({
  dbMock: { user: { findUnique: vi.fn() }, passwordReset: { deleteMany: vi.fn(), create: vi.fn() } },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  checkRateLimitMock: vi.fn(),
  emailMock: { sendPasswordResetEmail: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  addRateLimitHeaders: (res: Response) => res,
}));
vi.mock('@/lib/email', () => emailMock);

import { POST } from './route';

function request(email: string) {
  return new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

/** Semua argumen yang pernah diberikan ke logger, digabung jadi satu string. */
function loggedText(): string {
  return [
    ...loggerMock.info.mock.calls,
    ...loggerMock.warn.mock.calls,
    ...loggerMock.error.mock.calls,
    ...loggerMock.debug.mock.calls,
  ]
    .flat()
    .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
    .join(' ');
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  dbMock.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'U' });
  dbMock.passwordReset.deleteMany.mockResolvedValue({ count: 0 });
  dbMock.passwordReset.create.mockResolvedValue({});
  vi.stubEnv('NEXTAUTH_URL', 'https://anichin.id');
  // SMTP tidak dikonfigurasi.
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('SMTP_USER', '');
  vi.stubEnv('SMTP_PASS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/forgot-password', () => {
  it('produksi tanpa SMTP: token reset TIDAK masuk log', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await POST(request('user@example.com'));

    expect(res.status).toBe(200);
    expect(loggedText()).not.toContain('reset-password?token=');
    expect(loggedText()).not.toContain('token=');
  });

  it('non-produksi tanpa SMTP: URL reset tetap di-log untuk QA', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    await POST(request('user@example.com'));

    expect(loggedText()).toContain('reset-password?token=');
  });

  it('selalu 200 walau email tidak terdaftar (anti-enumeration)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    dbMock.user.findUnique.mockResolvedValue(null);

    const res = await POST(request('tidak-ada@example.com'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(dbMock.passwordReset.create).not.toHaveBeenCalled();
  });
});
