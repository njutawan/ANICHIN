/**
 * Regresi audit F-12 (anti-enumeration pendaftaran) & F-17 (batas bcrypt 72 byte).
 *
 * F-12 — dulu `POST /api/auth/register` menjawab 409 "Email sudah terdaftar.",
 * sehingga siapa pun bisa memeriksa apakah sebuah email punya akun (padahal
 * `forgot-password` sengaja anti-enumeration). Sekarang respons untuk email baru
 * dan email yang sudah terdaftar **identik** — pemilik email asli diberi tahu
 * lewat email, bukan lewat respons HTTP.
 *
 * F-17 — bcrypt hanya memakai 72 byte pertama password. Pendaftaran menerima
 * 128 karakter, jadi password panjang diam-diam tidak menambah keamanan.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  dbMock,
  checkRateLimitMock,
  createVerificationTokenMock,
  sendAccountExistsEmailMock,
  sendVerificationEmailMock,
  loggerMock,
} = vi.hoisted(() => ({
  dbMock: { user: { findUnique: vi.fn(), create: vi.fn() } },
  checkRateLimitMock: vi.fn(),
  createVerificationTokenMock: vi.fn(),
  sendAccountExistsEmailMock: vi.fn(),
  sendVerificationEmailMock: vi.fn(),
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  addRateLimitHeaders: (res: Response) => res,
}));
vi.mock('@/lib/email', () => ({
  createVerificationToken: createVerificationTokenMock,
  sendAccountExistsEmail: sendAccountExistsEmailMock,
  sendVerificationEmail: sendVerificationEmailMock,
}));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = { name: 'Pengguna Uji', email: 'baru@example.com', password: 'Password123' };

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  dbMock.user.findUnique.mockResolvedValue(null);
  dbMock.user.create.mockResolvedValue({ id: 'u1' });
  createVerificationTokenMock.mockResolvedValue({ token: 'a'.repeat(64), expiresAt: new Date() });
  sendAccountExistsEmailMock.mockResolvedValue({ delivered: false, provider: 'console' });
  sendVerificationEmailMock.mockResolvedValue({ delivered: true, provider: 'smtp' });
});

describe('F-12 — respon tidak membedakan email baru vs sudah terdaftar', () => {
  it('email baru → 201 { registered: true } tanpa data user', async () => {
    const res = await POST(request(VALID));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ registered: true });
    expect(dbMock.user.create).toHaveBeenCalledTimes(1);
    expect(dbMock.user.create.mock.calls[0][0].data.emailVerified).toBeNull();
    expect(createVerificationTokenMock).toHaveBeenCalledWith('u1');
    expect(sendVerificationEmailMock).toHaveBeenCalledWith(
      'baru@example.com',
      expect.stringMatching(/\/api\/auth\/verify-email\?token=a{64}$/),
    );
    // Tidak ada id/email/nama user di respons (bentuk respons tidak boleh
    // bergantung pada ada/tidaknya akun).
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('email');
  });

  it('email sudah terdaftar → respons IDENTIK, dan pemilik email diberi tahu', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'existing-1', emailVerified: new Date() });

    const existingRes = await POST(request(VALID));
    const existingBody = await existingRes.json();

    // Cabang "sudah terdaftar": tidak ada akun baru, dan pemilik email diberi tahu.
    expect(dbMock.user.create).not.toHaveBeenCalled();
    expect(sendAccountExistsEmailMock).toHaveBeenCalledTimes(1);
    expect(sendAccountExistsEmailMock.mock.calls[0][0]).toBe('baru@example.com');

    // Cabang "email baru": status & body harus sama persis.
    dbMock.user.findUnique.mockResolvedValue(null);
    const freshRes = await POST(request(VALID));
    const freshBody = await freshRes.json();

    expect(existingRes.status).toBe(freshRes.status);
    expect(existingBody).toEqual(freshBody);
    expect(dbMock.user.create).toHaveBeenCalledTimes(1);
  });

  it('akun legacy yang belum verified dapat meminta token tanpa login', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'legacy-user', emailVerified: null });

    const res = await POST(request(VALID));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ registered: true });
    expect(dbMock.user.create).not.toHaveBeenCalled();
    expect(createVerificationTokenMock).toHaveBeenCalledWith('legacy-user');
    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendAccountExistsEmailMock).not.toHaveBeenCalled();
  });

  it('balapan pendaftaran (P2002) → respons juga identik, bukan 409', async () => {
    dbMock.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    const res = await POST(request(VALID));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ registered: true });
  });

  it('kegagalan kirim email tidak mengubah respons maupun menggagalkan pendaftaran', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'existing-1', emailVerified: new Date() });
    sendAccountExistsEmailMock.mockRejectedValue(new Error('smtp down'));

    const res = await POST(request(VALID));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ registered: true });
  });

  it('error server tetap generik (tidak membocorkan detail)', async () => {
    dbMock.user.findUnique.mockRejectedValue(new Error('PGPASSWORD=rahasia gagal'));

    const res = await POST(request(VALID));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('rahasia');
  });
});

describe('F-17 — password dibatasi 72 byte (batas bcrypt)', () => {
  it('password 72 byte diterima', async () => {
    const res = await POST(request({ ...VALID, password: `${'a'.repeat(71)}1` }));

    expect(res.status).toBe(201);
  });

  it('password 73 byte ditolak dengan pesan yang menyebut batasnya', async () => {
    const res = await POST(request({ ...VALID, password: `${'a'.repeat(72)}1` }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('72');
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it('karakter non-ASCII dihitung per byte (24 × é = 48 byte OK, 40 × é = 80 byte ditolak)', async () => {
    const okRes = await POST(request({ ...VALID, password: `${'é'.repeat(24)}1a` })); // 48 + 2 byte
    expect(okRes.status).toBe(201);

    const tooLongRes = await POST(
      request({ ...VALID, password: `${'é'.repeat(40)}1a` }) // 80 + 2 byte
    );
    expect(tooLongRes.status).toBe(400);
  });

  it('batas karakter lama (128) tidak lagi jadi acuan', async () => {
    // 100 karakter ASCII = 100 byte → ditolak karena melebihi 72 byte,
    // meskipun masih di bawah 128 karakter.
    const res = await POST(request({ ...VALID, password: `${'a'.repeat(99)}12` }));

    expect(res.status).toBe(400);
  });

  it('password pendek / lemah tetap ditolak seperti sebelumnya', async () => {
    const short = await POST(request({ ...VALID, password: 'Ab1' }));
    expect(short.status).toBe(400);

    const noNumber = await POST(request({ ...VALID, password: 'password' }));
    expect(noNumber.status).toBe(400);
  });
});
