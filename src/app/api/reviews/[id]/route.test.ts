/**
 * Test untuk DELETE /api/reviews/[id] — endpoint yang sebelumnya **tidak ada**
 * padahal tombol "Hapus" di `reviews-tab.tsx` sudah memanggilnya (selalu gagal).
 *
 * Aturan: penulis sendiri atau admin; selain itu 403.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { dbMock, requireUserMock, checkRateLimitMock } = vi.hoisted(() => ({
  dbMock: {
    serverReview: { findUnique: vi.fn(), delete: vi.fn() },
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
  return new NextRequest(`http://localhost/api/reviews/${id}`, { method: 'DELETE' });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  requireUserMock.mockResolvedValue([OWNER, null]);
  dbMock.serverReview.findUnique.mockResolvedValue({ id: 'r1', userId: 'user-1' });
  dbMock.serverReview.delete.mockResolvedValue({ id: 'r1' });
});

describe('DELETE /api/reviews/[id]', () => {
  it('menghapus ulasan milik sendiri', async () => {
    const res = await DELETE(request('r1'), params('r1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'r1' });
    expect(dbMock.serverReview.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('admin boleh menghapus ulasan orang lain', async () => {
    requireUserMock.mockResolvedValue([ADMIN, null]);
    dbMock.serverReview.findUnique.mockResolvedValue({ id: 'r1', userId: 'user-9' });

    const res = await DELETE(request('r1'), params('r1'));

    expect(res.status).toBe(200);
    expect(dbMock.serverReview.delete).toHaveBeenCalled();
  });

  it('menolak (403) pengguna lain dan tidak menghapus apa pun', async () => {
    requireUserMock.mockResolvedValue([OTHER, null]);
    const res = await DELETE(request('r1'), params('r1'));

    expect(res.status).toBe(403);
    expect(dbMock.serverReview.delete).not.toHaveBeenCalled();
  });

  it('404 kalau ulasan sudah tidak ada', async () => {
    dbMock.serverReview.findUnique.mockResolvedValue(null);
    const res = await DELETE(request('hilang'), params('hilang'));

    expect(res.status).toBe(404);
    expect(dbMock.serverReview.delete).not.toHaveBeenCalled();
  });

  it('meneruskan respons 401 dari requireUser (belum login)', async () => {
    requireUserMock.mockResolvedValue([
      null,
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    ]);
    const res = await DELETE(request('r1'), params('r1'));

    expect(res.status).toBe(401);
    expect(dbMock.serverReview.findUnique).not.toHaveBeenCalled();
  });

  it('menolak ID yang tidak wajar tanpa menyentuh DB', async () => {
    const res = await DELETE(request('x'.repeat(100)), params('x'.repeat(100)));

    expect(res.status).toBe(400);
    expect(dbMock.serverReview.findUnique).not.toHaveBeenCalled();
  });

  it('mengembalikan 429 saat rate limit aktif', async () => {
    checkRateLimitMock.mockResolvedValue(new Response('{}', { status: 429 }));
    const res = await DELETE(request('r1'), params('r1'));

    expect(res.status).toBe(429);
    expect(dbMock.serverReview.findUnique).not.toHaveBeenCalled();
  });

  it('404 (bukan 500) kalau baris keburu dihapus perangkat lain (P2025)', async () => {
    const err = Object.assign(new Error('not found'), { code: 'P2025' });
    dbMock.serverReview.delete.mockRejectedValue(err);

    const res = await DELETE(request('r1'), params('r1'));

    expect(res.status).toBe(404);
  });

  it('500 (bukan crash) kalau DB error', async () => {
    dbMock.serverReview.findUnique.mockRejectedValue(new Error('db down'));
    const res = await DELETE(request('r1'), params('r1'));

    expect(res.status).toBe(500);
  });
});
