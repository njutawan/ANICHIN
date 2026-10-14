/**
 * Regresi audit: endpoint status 2FA tidak boleh menjadi oracle verifikasi TOTP.
 *
 * Temuan: versi lama menerima `{ email, token }` dan memvalidasi kode TOTP tanpa
 * autentikasi — penyerang dengan password korban bisa mencari kode valid di luar
 * lockout login (5×/15 menit) lalu memakainya sekali di `signIn`.
 *
 * Kontrak baru: hanya `{ email }` → `{ requiresTwoFactor }`. Verifikasi TOTP
 * hanya di src/lib/auth.ts (authorize), yang dilindungi lockout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { dbMock, checkRateLimitMock, twoFactorMock } = vi.hoisted(() => ({
  dbMock: { user: { findUnique: vi.fn() } },
  checkRateLimitMock: vi.fn(),
  twoFactorMock: { verifyTwoFactorToken: vi.fn(), decryptSecret: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  addRateLimitHeaders: (res: Response) => res,
}));
vi.mock('@/lib/two-factor', () => twoFactorMock);

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/auth/2fa/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  dbMock.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });
});

describe('POST /api/auth/2fa/verify', () => {
  it('melaporkan requiresTwoFactor tanpa memverifikasi kode TOTP', async () => {
    const res = await POST(request({ email: 'u@example.com', token: '123456' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ requiresTwoFactor: true });

    // Tidak ada jalur verifikasi kode di endpoint publik ini.
    expect(twoFactorMock.verifyTwoFactorToken).not.toHaveBeenCalled();
    expect(twoFactorMock.decryptSecret).not.toHaveBeenCalled();
    // Secret 2FA tidak boleh ikut dibaca dari DB.
    expect(dbMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: { twoFactorEnabled: true } }),
    );
  });

  it('akun tanpa 2FA / email tidak dikenal → requiresTwoFactor: false', async () => {
    dbMock.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
    let res = await POST(request({ email: 'u@example.com' }));
    expect(await res.json()).toEqual({ requiresTwoFactor: false });

    dbMock.user.findUnique.mockResolvedValue(null);
    res = await POST(request({ email: 'tidak-ada@example.com' }));
    expect(await res.json()).toEqual({ requiresTwoFactor: false });
  });

  it('menolak email tidak valid (400) dan body terlalu besar (413)', async () => {
    const bad = await POST(request({ email: 'bukan-email' }));
    expect(bad.status).toBe(400);

    const big = new NextRequest('http://localhost/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '99999' },
      body: JSON.stringify({ email: 'u@example.com' }),
    });
    const oversized = await POST(big);
    expect(oversized.status).toBe(413);
  });

  it('meneruskan 429 dari rate limit', async () => {
    checkRateLimitMock.mockResolvedValue(new Response('{}', { status: 429 }));
    const res = await POST(request({ email: 'u@example.com' }));
    expect(res.status).toBe(429);
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('DB error → 500 generik (tanpa detail internal)', async () => {
    dbMock.user.findUnique.mockRejectedValue(new Error('connection refused to db:5432'));
    const res = await POST(request({ email: 'u@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('5432');
  });
});
