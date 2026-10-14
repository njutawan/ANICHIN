/**
 * Regresi audit F-10 — endpoint pembuatan ulang kode cadangan 2FA.
 *
 * Kontrak:
 *  - wajib login (401 tanpa sesi) dan wajib password yang benar,
 *  - 2FA harus aktif (409 bila tidak),
 *  - kode lama dihapus & kode baru dikembalikan sekali (plaintext tidak pernah
 *    masuk database — penyimpanan hash ada di src/lib/two-factor-backup.ts),
 *  - error tidak pernah membocorkan detail internal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashSync } from 'bcryptjs';

const { dbMock, checkRateLimitMock, requireUserMock, saveBackupCodesMock, loggerMock } =
  vi.hoisted(() => ({
    dbMock: { user: { findUnique: vi.fn() } },
    checkRateLimitMock: vi.fn(),
    requireUserMock: vi.fn(),
    saveBackupCodesMock: vi.fn(),
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  addRateLimitHeaders: (res: Response) => res,
}));
vi.mock('@/lib/session', () => ({ requireUser: requireUserMock }));
vi.mock('@/lib/two-factor-backup', () => ({ saveBackupCodes: saveBackupCodesMock }));

import { POST } from './route';

const PASSWORD = 'password-yang-benar';

function request(body: unknown, raw = false) {
  return new NextRequest('http://localhost/api/auth/2fa/backup-codes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  requireUserMock.mockResolvedValue([
    { user: { id: 'user-1', email: 'u@example.com', role: 'user' } },
    null,
  ]);
  dbMock.user.findUnique.mockResolvedValue({
    password: hashSync(PASSWORD, 10),
    twoFactorEnabled: true,
    role: 'user',
  });
  saveBackupCodesMock.mockResolvedValue(undefined);
});

describe('POST /api/auth/2fa/backup-codes', () => {
  it('password benar → 8 kode baru dikembalikan & disimpan sebagai hash', async () => {
    const res = await POST(request({ password: PASSWORD }));
    const body = (await res.json()) as { backupCodes: string[]; count: number };

    expect(res.status).toBe(200);
    expect(body.count).toBe(8);
    expect(body.backupCodes).toHaveLength(8);
    for (const code of body.backupCodes) {
      expect(code).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
    }

    // Yang dikirim ke penyimpanan adalah kode plaintext; hashing ada di
    // saveBackupCodes (di-mock di sini) — tidak ada hash/plaintext yang bocor
    // ke respons selain kode itu sendiri.
    expect(saveBackupCodesMock).toHaveBeenCalledWith('user-1', body.backupCodes);
  });

  it('tanpa sesi → 401 (handler tidak jalan)', async () => {
    const unauthorized = new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
    requireUserMock.mockResolvedValue([null, unauthorized]);

    const res = await POST(request({ password: PASSWORD }));

    expect(res.status).toBe(401);
    expect(saveBackupCodesMock).not.toHaveBeenCalled();
  });

  it('password salah → 401 dan tidak ada kode yang dibuat', async () => {
    const res = await POST(request({ password: 'password-salah' }));

    expect(res.status).toBe(401);
    expect(saveBackupCodesMock).not.toHaveBeenCalled();
    // Tidak membocorkan detail apa pun.
    expect((await res.json()).error).toBe('Password salah. Coba lagi.');
  });

  it('password kosong / bukan string → 400 tanpa menyentuh DB', async () => {
    for (const body of [{}, { password: '' }, { password: 123 }, { password: null }]) {
      const res = await POST(request(body));
      expect(res.status).toBe(400);
    }
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
    expect(saveBackupCodesMock).not.toHaveBeenCalled();
  });

  it('2FA belum aktif → 409 (kode cadangan tidak punya arti)', async () => {
    dbMock.user.findUnique.mockResolvedValue({
      password: hashSync(PASSWORD, 10),
      twoFactorEnabled: false,
      role: 'user',
    });

    const res = await POST(request({ password: PASSWORD }));

    expect(res.status).toBe(409);
    expect(saveBackupCodesMock).not.toHaveBeenCalled();
  });

  it('akun tidak ditemukan → 404', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);

    const res = await POST(request({ password: PASSWORD }));

    expect(res.status).toBe(404);
    expect(saveBackupCodesMock).not.toHaveBeenCalled();
  });

  it('gagal menyimpan → 500 dengan pesan generik', async () => {
    saveBackupCodesMock.mockRejectedValue(new Error('PGPASSWORD=rahasia gagal'));

    const res = await POST(request({ password: PASSWORD }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Gagal menyimpan kode cadangan. Coba lagi.');
    expect(JSON.stringify(body)).not.toContain('rahasia');
  });

  it('body rusak → 400, bukan 500', async () => {
    const res = await POST(request('{bukan json', true));

    expect(res.status).toBe(400);
  });

  it('rate limit auth berlaku', async () => {
    checkRateLimitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Terlalu banyak permintaan' }), { status: 429 })
    );

    const res = await POST(request({ password: PASSWORD }));

    expect(res.status).toBe(429);
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });
});
