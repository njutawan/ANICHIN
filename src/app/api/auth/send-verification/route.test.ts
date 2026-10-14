/**
 * Regresi audit: `POST /api/auth/send-verification` tidak boleh membalas token
 * verifikasi ke klien di produksi.
 *
 * Lapis pertahanan yang diuji:
 *   1. `email.ts` tidak lagi mengembalikan `devUrl` di produksi (diuji di
 *      src/lib/email-security.test.ts).
 *   2. Route ini tetap menyaring `devUrl` walau (mis. karena bug/refactor di
 *      masa depan) modul email mengembalikannya di produksi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { dbMock, requireUserMock, checkRateLimitMock, emailMock } = vi.hoisted(() => ({
  dbMock: { user: { findUnique: vi.fn() } },
  requireUserMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  emailMock: { createVerificationToken: vi.fn(), sendVerificationEmail: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/session', () => ({ requireUser: requireUserMock }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  addRateLimitHeaders: (res: Response) => res,
}));
vi.mock('@/lib/email', () => emailMock);

import { POST } from './route';

const SESSION = { user: { id: 'user-1', email: 'u@example.com', role: 'user' as const } };
const TOKEN_URL =
  'https://anichin.id/api/auth/verify-email?token=' + 'c'.repeat(64);

function request() {
  return new NextRequest('http://localhost/api/auth/send-verification', {
    method: 'POST',
    headers: { 'content-length': '0' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  requireUserMock.mockResolvedValue([SESSION, null]);
  dbMock.user.findUnique.mockResolvedValue({
    email: 'u@example.com',
    emailVerified: null,
    name: 'U',
  });
  emailMock.createVerificationToken.mockResolvedValue({ token: 'c'.repeat(64), expiresAt: new Date() });
  vi.stubEnv('NEXTAUTH_URL', 'https://anichin.id');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/send-verification', () => {
  it('produksi: tidak pernah membalas devUrl walau modul email mengembalikannya', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    emailMock.sendVerificationEmail.mockResolvedValue({
      delivered: true,
      provider: 'console',
      devUrl: TOKEN_URL, // seolah-olah bug lama muncul lagi
    });

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.devUrl).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('token=');
  });

  it('non-produksi: devUrl diteruskan supaya QA bisa mengklik link', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    emailMock.sendVerificationEmail.mockResolvedValue({
      delivered: true,
      provider: 'console',
      devUrl: TOKEN_URL,
    });

    const res = await POST(request());
    const body = await res.json();

    expect(body.devUrl).toBe(TOKEN_URL);
  });

  it('SMTP gagal (delivered:false) → 502 dengan pesan generik', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    emailMock.sendVerificationEmail.mockResolvedValue({
      delivered: false,
      provider: 'console',
      error: 'SMTP not configured',
    });

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBeTypeOf('string');
    expect(JSON.stringify(body)).not.toContain('SMTP not configured');
  });
});
