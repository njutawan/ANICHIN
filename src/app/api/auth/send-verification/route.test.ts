import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { dbMock, checkRateLimitMock, emailMock } = vi.hoisted(() => ({
  dbMock: { user: { findUnique: vi.fn() } },
  checkRateLimitMock: vi.fn(),
  emailMock: { createVerificationToken: vi.fn(), sendVerificationEmail: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  addRateLimitHeaders: (res: Response) => res,
}));
vi.mock('@/lib/email', () => emailMock);
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

const TOKEN_URL = 'https://anichin.id/api/auth/verify-email?token=' + 'c'.repeat(64);

function request(email = 'u@example.com') {
  return new NextRequest('http://localhost/api/auth/send-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  dbMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@example.com', emailVerified: null });
  emailMock.createVerificationToken.mockResolvedValue({ token: 'c'.repeat(64), expiresAt: new Date() });
  emailMock.sendVerificationEmail.mockResolvedValue({ delivered: true, provider: 'console', devUrl: TOKEN_URL });
  vi.stubEnv('NEXTAUTH_URL', 'https://anichin.id');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/send-verification', () => {
  it('produksi: resend tidak memerlukan sesi dan tidak pernah mengembalikan token', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ sent: true });
    expect(dbMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'u@example.com' },
      select: { id: true, email: true, emailVerified: true },
    });
    expect(emailMock.createVerificationToken).toHaveBeenCalledWith('user-1');
    expect(emailMock.sendVerificationEmail).toHaveBeenCalledWith('u@example.com', TOKEN_URL);
    expect(JSON.stringify(body)).not.toContain('token=');
  });

  it('non-produksi: devUrl diteruskan supaya QA bisa mengklik link', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const res = await POST(request());
    const body = await res.json();

    expect(body).toEqual({ sent: true, devUrl: TOKEN_URL });
  });

  it('alamat tidak dikenal atau sudah verified mendapat respons identik tanpa email', async () => {
    dbMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'verified-user',
      email: 'u@example.com',
      emailVerified: new Date(),
    });

    const unknown = await POST(request());
    const verified = await POST(request());

    expect(unknown.status).toBe(verified.status);
    expect(await unknown.json()).toEqual(await verified.json());
    expect(emailMock.createVerificationToken).not.toHaveBeenCalled();
    expect(emailMock.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('SMTP gagal: tetap memberi respons generik anti-enumeration dan tidak membocorkan detail', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    emailMock.sendVerificationEmail.mockResolvedValue({
      delivered: false,
      provider: 'console',
      error: 'SMTP not configured',
    });

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ sent: true });
    expect(JSON.stringify(body)).not.toContain('SMTP not configured');
  });

  it('menolak JSON besar dan format email invalid', async () => {
    const oversized = new NextRequest('http://localhost/api/auth/send-verification', {
      method: 'POST',
      headers: { 'content-length': '5000', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@example.com' }),
    });
    expect((await POST(oversized)).status).toBe(413);

    expect((await POST(request('not-an-email'))).status).toBe(400);
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });
});
