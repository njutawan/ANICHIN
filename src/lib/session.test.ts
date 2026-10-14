/**
 * Regresi audit F-06 — guard server-side (`requireUser`/`requireAdmin`).
 *
 * Guard ini menempuh jalur session NextAuth (yang menjalankan `jwt` callback →
 * pengecekan `sessionVersion` ke DB), lalu memperlakukan sesi tanpa `id`/`role`
 * sebagai BELUM LOGIN. Aturan itu penting: sesi yang sudah dicabut sengaja
 * kehilangan `id`/`role`, dan dulu guard bisa "lolos" dengan sesi kosong
 * (`session.user` ada tapi tanpa id) sehingga `session!.user.id` menjadi
 * undefined di route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: { secret: 'test-secret' } }));

import {
  getServerAuthSession,
  requireAdmin,
  requireUser,
  getCurrentUserId,
  isAdmin,
} from '@/lib/session';

const VALID_USER = {
  id: 'u1',
  name: 'Nama',
  email: 'u@example.com',
  image: null,
  role: 'user' as const,
};

function sessionWith(user: unknown) {
  return { user, expires: '2099-01-01T00:00:00.000Z' };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue(null);
});

describe('getServerAuthSession()', () => {
  it('null tanpa sesi', async () => {
    expect(await getServerAuthSession()).toBeNull();
  });

  it('membangun sesi bertipe dari sesi NextAuth', async () => {
    getServerSessionMock.mockResolvedValue(sessionWith({ ...VALID_USER, role: 'admin' }));

    const session = await getServerAuthSession();

    expect(session).toMatchObject({
      user: { id: 'u1', role: 'admin', email: 'u@example.com' },
      expires: '2099-01-01T00:00:00.000Z',
    });
  });

  it('sesi yang dicabut (user tanpa id/role) dianggap belum login', async () => {
    // Inilah bentuk respons setelah pencabutan: objek sesi kosong.
    getServerSessionMock.mockResolvedValue({});
    expect(await getServerAuthSession()).toBeNull();

    getServerSessionMock.mockResolvedValue(sessionWith(undefined));
    expect(await getServerAuthSession()).toBeNull();

    getServerSessionMock.mockResolvedValue(sessionWith({ name: 'Nama' }));
    expect(await getServerAuthSession()).toBeNull();
  });

  it('error saat menyusun sesi → null, bukan lempar (fail closed)', async () => {
    getServerSessionMock.mockRejectedValue(new Error('NEXTAUTH_SECRET missing in production'));

    await expect(getServerAuthSession()).resolves.toBeNull();
  });
});

describe('requireUser() / requireAdmin()', () => {
  it('401 saat belum login', async () => {
    const [session, err] = await requireUser();
    expect(session).toBeNull();
    expect(err!.status).toBe(401);
  });

  it('401 saat sesi sudah dicabut', async () => {
    getServerSessionMock.mockResolvedValue({});

    const [session, err] = await requireUser();
    expect(session).toBeNull();
    expect(err!.status).toBe(401);
  });

  it('meneruskan sesi user biasa untuk requireUser', async () => {
    getServerSessionMock.mockResolvedValue(sessionWith(VALID_USER));

    const [session, err] = await requireUser();

    expect(err).toBeNull();
    expect(session!.user.id).toBe('u1');
  });

  it('403 saat user biasa meminta akses admin', async () => {
    getServerSessionMock.mockResolvedValue(sessionWith(VALID_USER));

    const [session, err] = await requireAdmin();

    expect(session).toBeNull();
    expect(err!.status).toBe(403);
  });

  it('lolos untuk admin', async () => {
    getServerSessionMock.mockResolvedValue(sessionWith({ ...VALID_USER, id: 'a1', role: 'admin' }));

    const [session, err] = await requireAdmin();

    expect(err).toBeNull();
    expect(session!.user.role).toBe('admin');
  });
});

describe('helper lain', () => {
  it('getCurrentUserId / isAdmin mengikuti sesi', async () => {
    getServerSessionMock.mockResolvedValue(sessionWith({ ...VALID_USER, id: 'a1', role: 'admin' }));

    expect(await getCurrentUserId()).toBe('a1');
    expect(await isAdmin()).toBe(true);
  });

  it('getCurrentUserId null + isAdmin false saat belum login', async () => {
    expect(await getCurrentUserId()).toBeNull();
    expect(await isAdmin()).toBe(false);
  });
});
