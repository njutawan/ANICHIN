/**
 * Regresi audit F-06 — pencabutan sesi (revokasi JWT).
 *
 * JWT bersifat stateless, jadi `sessionVersion` (kolom baru di tabel User)
 * disalin ke klaim token saat login dan divalidasi ulang ke DB secara berkala.
 * Token ditolak bila:
 *   - `sessionVersion` di DB berbeda (password direset / role diubah admin), atau
 *   - baris User sudah tidak ada (akun dihapus).
 *
 * Aturan tambahan yang dikunci di sini:
 *   - token lama tanpa klaim `sv` (diterbitkan sebelum fitur ini) TIDAK dicabut —
 *     nilainya diadopsi dari DB (trust on first use).
 *   - DB error → token dipertahankan (fail open) supaya gangguan DB sesaat tidak
 *     menulis ulang cookie semua orang menjadi token kosong (logout massal).
 *   - identitas saat login diambil dari DB (id/role/sv) — penting untuk OAuth,
 *     yang objek `user`-nya adalah profil provider, bukan baris User kita.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock } = vi.hoisted(() => ({
  dbMock: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

import { authOptions } from '@/lib/auth';

type JwtArgs = {
  token: Record<string, unknown>;
  user?: Record<string, unknown>;
  trigger?: 'signIn' | 'signUp' | 'update';
};
type JwtResult = Record<string, unknown>;

const jwtCallback = authOptions.callbacks!.jwt as unknown as (args: JwtArgs) => Promise<JwtResult>;
const sessionCallback = authOptions.callbacks!.session as unknown as (args: {
  session: Record<string, unknown>;
  token: Record<string, unknown>;
}) => Promise<{ user?: Record<string, unknown> }>;

const DB_USER = {
  id: 'db-user-1',
  role: 'user',
  name: 'Nama DB',
  sessionVersion: 3,
  emailVerified: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.user.findUnique.mockResolvedValue(DB_USER);
  vi.stubEnv('SESSION_REVALIDATE_SECONDS', '60');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('jwt callback — login (identitas dari DB)', () => {
  it('menyalin id/role/name/sessionVersion dari DB (bukan dari objek provider)', async () => {
    const token = await jwtCallback({
      token: {},
      user: {
        // Profil OAuth: id milik provider, role tidak ada.
        id: 'google-oauth2|123',
        email: 'User@Example.com ',
        name: 'Profil Provider',
      },
    });

    expect(dbMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      select: { id: true, role: true, name: true, sessionVersion: true, emailVerified: true },
    });
    expect(token).toMatchObject({
      id: 'db-user-1',
      role: 'user',
      name: 'Nama DB',
      sv: 3,
    });
    expect(token.svCheckedAt).toBeTypeOf('number');
  });

  it('menolak login OAuth/kredensial bila row akun belum verified', async () => {
    dbMock.user.findUnique.mockResolvedValue({ ...DB_USER, emailVerified: null });

    const token = await jwtCallback({
      token: {},
      user: { id: 'provider-user', email: 'user@example.com', role: 'user' },
    });

    expect(token.id).toBeUndefined();
    expect(token.role).toBeUndefined();
  });

  it('menolak membuat sesi jika query identitas gagal (fail closed)', async () => {
    dbMock.user.findUnique.mockRejectedValue(new Error('db down'));

    const token = await jwtCallback({
      token: {},
      user: { id: 'kredensial-1', email: 'user@example.com', role: 'admin' },
    });

    expect(token.id).toBeUndefined();
    expect(token.role).toBeUndefined();
    expect(token.sv).toBeUndefined();
  });
});

describe('jwt callback — validasi berkala & pencabutan', () => {
  it('tidak menyentuh DB selama jendela validasi belum lewat', async () => {
    const token = await jwtCallback({
      token: { id: 'db-user-1', role: 'user', sv: 3, svCheckedAt: Date.now() },
    });

    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
    expect(token.id).toBe('db-user-1');
  });

  it('mencabut token saat sessionVersion di DB berbeda (password direset)', async () => {
    dbMock.user.findUnique.mockResolvedValue({ ...DB_USER, sessionVersion: 4 });

    const token = await jwtCallback({
      token: {
        id: 'db-user-1',
        role: 'user',
        sv: 3,
        svCheckedAt: Date.now() - 120_000,
        name: 'Lama',
        email: 'user@example.com',
      },
    });

    expect(token.id).toBeUndefined();
    expect(token.role).toBeUndefined();
    expect(token.sv).toBeUndefined();
  });

  it('mencabut sesi lama jika email akun belum diverifikasi', async () => {
    dbMock.user.findUnique.mockResolvedValue({ ...DB_USER, emailVerified: null });

    const token = await jwtCallback({
      token: { id: 'db-user-1', role: 'user', sv: 3, svCheckedAt: Date.now() - 120_000 },
    });

    expect(token.id).toBeUndefined();
    expect(token.role).toBeUndefined();
  });

  it('mencabut token saat akun sudah dihapus', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);

    const token = await jwtCallback({
      token: { id: 'db-user-1', role: 'admin', sv: 3, svCheckedAt: Date.now() - 120_000 },
    });

    expect(token.id).toBeUndefined();
    expect(token.role).toBeUndefined();
  });

  it('menyegarkan role dari DB (mis. admin baru diturunkan ke user)', async () => {
    dbMock.user.findUnique.mockResolvedValue({ ...DB_USER, role: 'user', sessionVersion: 3 });

    const token = await jwtCallback({
      token: { id: 'db-user-1', role: 'admin', sv: 3, svCheckedAt: Date.now() - 120_000 },
    });

    expect(token.role).toBe('user');
    expect(token.id).toBe('db-user-1');
  });

  it('token lama tanpa klaim sv: mengadopsi nilai DB (tidak dicabut)', async () => {
    const token = await jwtCallback({
      token: { id: 'db-user-1', role: 'user', svCheckedAt: 0 },
    });

    expect(token.id).toBe('db-user-1');
    expect(token.sv).toBe(3);
  });

  it('trigger update memaksa validasi walau jendela belum lewat', async () => {
    const token = await jwtCallback({
      trigger: 'update',
      token: { id: 'db-user-1', role: 'user', sv: 3, svCheckedAt: Date.now() },
    });

    expect(dbMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(token.sv).toBe(3);
  });

  it('DB error saat validasi: token dipertahankan dan jadwal tidak dimajukan (fail open)', async () => {
    dbMock.user.findUnique.mockRejectedValue(new Error('db down'));
    const checkedAt = Date.now() - 120_000;

    const token = await jwtCallback({
      token: { id: 'db-user-1', role: 'user', sv: 3, svCheckedAt: checkedAt },
    });

    expect(token.id).toBe('db-user-1');
    expect(token.role).toBe('user');
    expect(token.svCheckedAt).toBe(checkedAt); // request berikutnya segera mencoba lagi
  });

  it('SESSION_REVALIDATE_SECONDS=0 → validasi setiap request', async () => {
    vi.stubEnv('SESSION_REVALIDATE_SECONDS', '0');

    await jwtCallback({ token: { id: 'db-user-1', role: 'user', sv: 3, svCheckedAt: Date.now() } });

    expect(dbMock.user.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('session callback — sesi yang dicabut tidak melaporkan user', () => {
  it('mengembalikan payload kosong (serializes to {}) saat klaim id/role sudah dibersihkan', async () => {
    const session = await sessionCallback({
      session: { user: { name: 'Lama', email: 'user@example.com' }, expires: 'x' },
      token: { name: null, email: undefined },
    });

    expect(session.user).toBeUndefined();
    expect(session.expires).toBeUndefined();
    // Body JSON tanpa kunci → SDK klien menganggapnya null (unauthenticated).
    expect(JSON.stringify(session)).toBe('{}');
  });

  it('mengisi id/role dari token saat sesi masih valid', async () => {
    const session = await sessionCallback({
      session: { user: { name: 'Nama', email: 'user@example.com' }, expires: 'x' },
      token: { id: 'db-user-1', role: 'admin', name: 'Nama DB' },
    });

    expect(session.user).toMatchObject({ id: 'db-user-1', role: 'admin' });
  });
});
