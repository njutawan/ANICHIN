/**
 * Test untuk DELETE /api/comments/[id] — penghapusan komentar yang benar-benar
 * terjadi di server (sebelumnya tombol hapus hanya menghapus localStorage).
 *
 * Aturan: penulis sendiri atau admin; selain itu 403.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { dbMock, requireUserMock, checkRateLimitMock } = vi.hoisted(() => ({
  dbMock: {
    serverComment: { findUnique: vi.fn(), delete: vi.fn() },
  },
  requireUserMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/session', () => ({ requireUser: requireUserMock }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  addRateLimitHeaders: (res: Response) => res,
}));

import { DELETE } from './route';

const OWNER = { user: { id: 'user-1', name: 'Tester', email: 't@example.com', role: 'user' } };
const OTHER = { user: { id: 'user-9', name: 'Lain', email: 'l@example.com', role: 'user' } };
const ADMIN = { user: { id: 'admin-1', name: 'Admin', email: 'a@example.com', role: 'admin' } };

function request(id: string) {
  return new NextRequest(`http://localhost/api/comments/${id}`, { method: 'DELETE' });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  requireUserMock.mockResolvedValue([OWNER, null]);
  dbMock.serverComment.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-1' });
  dbMock.serverComment.delete.mockResolvedValue({ id: 'c1' });
});

describe('DELETE /api/comments/[id]', () => {
  it('menghapus komentar milik sendiri', async () => {
    const res = await DELETE(request('c1'), params('c1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'c1' });
    expect(dbMock.serverComment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('admin boleh menghapus komentar orang lain', async () => {
    requireUserMock.mockResolvedValue([ADMIN, null]);
    const res = await DELETE(request('c1'), params('c1'));

    expect(res.status).toBe(200);
    expect(dbMock.serverComment.delete).toHaveBeenCalled();
  });

  it('menolak (403) pengguna lain dan tidak menghapus apa pun', async () => {
    requireUserMock.mockResolvedValue([OTHER, null]);
    const res = await DELETE(request('c1'), params('c1'));

    expect(res.status).toBe(403);
    expect(dbMock.serverComment.delete).not.toHaveBeenCalled();
  });

  it('404 kalau komentar sudah tidak ada', async () => {
    dbMock.serverComment.findUnique.mockResolvedValue(null);
    const res = await DELETE(request('hilang'), params('hilang'));

    expect(res.status).toBe(404);
    expect(dbMock.serverComment.delete).not.toHaveBeenCalled();
  });

  it('meneruskan respons 401 dari requireUser (belum login)', async () => {
    requireUserMock.mockResolvedValue([
      null,
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    ]);
    const res = await DELETE(request('c1'), params('c1'));

    expect(res.status).toBe(401);
    expect(dbMock.serverComment.findUnique).not.toHaveBeenCalled();
  });

  it('menolak ID yang tidak wajar tanpa menyentuh DB', async () => {
    const res = await DELETE(request('x'.repeat(100)), params('x'.repeat(100)));

    expect(res.status).toBe(400);
    expect(dbMock.serverComment.findUnique).not.toHaveBeenCalled();
  });

  it('mengembalikan 429 saat rate limit aktif', async () => {
    checkRateLimitMock.mockResolvedValue(new Response('{}', { status: 429 }));
    const res = await DELETE(request('c1'), params('c1'));

    expect(res.status).toBe(429);
    expect(dbMock.serverComment.findUnique).not.toHaveBeenCalled();
  });

  it('500 (bukan crash) kalau DB error', async () => {
    dbMock.serverComment.findUnique.mockRejectedValue(new Error('db down'));
    const res = await DELETE(request('c1'), params('c1'));

    expect(res.status).toBe(500);
  });
});
