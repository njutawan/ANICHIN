/**
 * Integration-ish tests for /api/comments & /api/reviews.
 *
 * Fokus pada perbaikan hasil code review:
 *   - GET kini dipaginasi (limit + 1 → hasMore/nextCursor), tidak lagi
 *     mengembalikan SELURUH baris dalam satu request.
 *   - Batas validasi = batas yang disimpan (tidak ada lagi pemotongan diam-diam
 *     dari 1000 → 300 karakter).
 *   - Rating harus integer 1-10 (string/desimal ditolak).
 *
 * Semua dependensi eksternal (db, session, rate-limit, audit-log) di-mock.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { dbMock, requireUserMock, checkRateLimitMock, auditMock } = vi.hoisted(() => ({
  dbMock: {
    serverComment: { findMany: vi.fn(), create: vi.fn() },
    serverReview: { findMany: vi.fn(), create: vi.fn() },
  },
  requireUserMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  auditMock: { rateLimitHit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/session', () => ({ requireUser: requireUserMock }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  addRateLimitHeaders: (res: Response) => res,
}));
vi.mock('@/lib/audit-log', () => ({ auditLog: auditMock }));

import { GET as getComments, POST as postComment } from './comments/route';
import { GET as getReviews, POST as postReview } from './reviews/route';
import { NextRequest } from 'next/server';

const SESSION = [{ user: { id: 'user-1', name: 'Tester', email: 't@example.com', role: 'user' } }, null];

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  requireUserMock.mockResolvedValue(SESSION);
});

describe('GET /api/comments', () => {
  it('mengembalikan daftar kosong tanpa parameter', async () => {
    const res = await getComments(new NextRequest('http://localhost/api/comments'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comments: [], hasMore: false, nextCursor: null });
    expect(dbMock.serverComment.findMany).not.toHaveBeenCalled();
  });

  it('membatasi jumlah baris (limit + 1) dan melaporkan hasMore', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `c${i}` }));
    dbMock.serverComment.findMany.mockResolvedValue(rows);

    const res = await getComments(
      new NextRequest('http://localhost/api/comments?animeSlug=shadow-blade&episodeNumber=3')
    );
    const body = await res.json();

    expect(dbMock.serverComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21, where: { animeSlug: 'shadow-blade', episodeNumber: 3 } })
    );
    expect(body.comments).toHaveLength(20);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe('c19');
  });

  it('meneruskan cursor ke query (tanpa duplikasi baris)', async () => {
    dbMock.serverComment.findMany.mockResolvedValue([{ id: 'c50' }]);
    await getComments(
      new NextRequest(
        'http://localhost/api/comments?animeSlug=shadow-blade&episodeNumber=3&cursor=c20&limit=10'
      )
    );
    expect(dbMock.serverComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'c20' }, skip: 1, take: 11 })
    );
  });

  it('menolak episodeNumber yang tidak valid (NaN/desimal/0)', async () => {
    for (const bad of ['abc', '1.5', '0', '99999']) {
      const res = await getComments(
        new NextRequest(`http://localhost/api/comments?animeSlug=a&episodeNumber=${bad}`)
      );
      expect(res.status).toBe(400);
    }
  });

  it('menolak limit di luar batas', async () => {
    const res = await getComments(
      new NextRequest('http://localhost/api/comments?animeSlug=a&episodeNumber=1&limit=5000')
    );
    expect(res.status).toBe(400);
  });

  it('menolak slug tidak valid (konsisten dengan POST)', async () => {
    for (const bad of ['../etc/passwd', 'Shadow_Blade', 'a b', 'x'.repeat(201)]) {
      const res = await getComments(
        new NextRequest(
          `http://localhost/api/comments?animeSlug=${encodeURIComponent(bad)}&episodeNumber=1`
        )
      );
      expect(res.status, `slug: ${bad}`).toBe(400);
      expect(dbMock.serverComment.findMany).not.toHaveBeenCalled();
    }
  });

  it('memakai urutan stabil (createdAt + id) supaya paginasi tidak melewatkan baris', async () => {
    dbMock.serverComment.findMany.mockResolvedValue([{ id: 'c1' }]);
    await getComments(
      new NextRequest('http://localhost/api/comments?animeSlug=shadow-blade&episodeNumber=1')
    );
    expect(dbMock.serverComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    );
  });

  it('cursor yang sudah tidak ada → 400 (bukan 500)', async () => {
    dbMock.serverComment.findMany.mockRejectedValue(
      Object.assign(new Error('cursor not found'), { code: 'P2025' })
    );
    const res = await getComments(
      new NextRequest(
        'http://localhost/api/comments?animeSlug=shadow-blade&episodeNumber=1&cursor=hilang'
      )
    );
    expect(res.status).toBe(400);
  });

  it('daftar komentar tidak di-cache CDN (komentar baru langsung terlihat)', async () => {
    dbMock.serverComment.findMany.mockResolvedValue([]);
    const res = await getComments(
      new NextRequest('http://localhost/api/comments?animeSlug=shadow-blade&episodeNumber=1')
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('POST /api/comments', () => {
  it('menyimpan komentar yang sudah disanitasi', async () => {
    dbMock.serverComment.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve({ id: 'new', ...(data as object) })
    );

    const res = await postComment(
      jsonRequest('http://localhost/api/comments', {
        animeSlug: 'shadow-blade',
        episodeNumber: 2,
        comment: '  Keren\u200D banget <script>alert(1)</script>  ',
      })
    );
    expect(res.status).toBe(201);
    const data = dbMock.serverComment.create.mock.calls[0][0].data;
    expect(data.comment).toBe('Keren banget alert(1)');
  });

  it('menolak komentar lebih panjang dari batas (bukan memotong diam-diam)', async () => {
    const res = await postComment(
      jsonRequest('http://localhost/api/comments', {
        animeSlug: 'shadow-blade',
        episodeNumber: 2,
        comment: 'x'.repeat(301),
      })
    );
    expect(res.status).toBe(400);
    expect(dbMock.serverComment.create).not.toHaveBeenCalled();
  });

  it('menolak slug aneh & payload non-JSON', async () => {
    const badSlug = await postComment(
      jsonRequest('http://localhost/api/comments', {
        animeSlug: '../etc/passwd',
        episodeNumber: 1,
        comment: 'halo dunia',
      })
    );
    expect(badSlug.status).toBe(400);

    const badJson = await postComment(
      new NextRequest('http://localhost/api/comments', { method: 'POST', body: '{oops' })
    );
    expect(badJson.status).toBe(400);
  });

  it('mengembalikan 401 bila belum login', async () => {
    requireUserMock.mockResolvedValue([null, Response.json({ error: 'unauthorized' }, { status: 401 })]);
    const res = await postComment(
      jsonRequest('http://localhost/api/comments', {
        animeSlug: 'shadow-blade',
        episodeNumber: 1,
        comment: 'halo dunia',
      })
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /api/reviews', () => {
  it('menolak slug tidak valid', async () => {
    const res = await getReviews(new NextRequest('http://localhost/api/reviews?animeSlug=../x'));
    expect(res.status).toBe(400);
  });

  it('dipaginasi', async () => {
    dbMock.serverReview.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    const res = await getReviews(
      new NextRequest('http://localhost/api/reviews?animeSlug=shadow-blade&limit=1')
    );
    const body = await res.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe('r1');
  });

  it('memakai urutan stabil (createdAt + id)', async () => {
    dbMock.serverReview.findMany.mockResolvedValue([]);
    await getReviews(new NextRequest('http://localhost/api/reviews?animeSlug=shadow-blade'));
    expect(dbMock.serverReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    );
  });

  it('cursor yang sudah tidak ada → 400 (bukan 500)', async () => {
    dbMock.serverReview.findMany.mockRejectedValue(
      Object.assign(new Error('cursor not found'), { code: 'P2025' })
    );
    const res = await getReviews(
      new NextRequest('http://localhost/api/reviews?animeSlug=shadow-blade&cursor=hilang')
    );
    expect(res.status).toBe(400);
  });

  it('daftar ulasan tidak di-cache CDN', async () => {
    dbMock.serverReview.findMany.mockResolvedValue([]);
    const res = await getReviews(
      new NextRequest('http://localhost/api/reviews?animeSlug=shadow-blade')
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('POST /api/reviews', () => {
  it('menolak rating bukan integer / di luar 1-10', async () => {
    for (const rating of ['9', 9.5, 0, 11, null]) {
      const res = await postReview(
        jsonRequest('http://localhost/api/reviews', {
          animeSlug: 'shadow-blade',
          rating,
          comment: 'Ulasan yang cukup panjang.',
        })
      );
      expect(res.status).toBe(400);
    }
  });

  it('menyimpan ulasan valid', async () => {
    dbMock.serverReview.create.mockResolvedValue({ id: 'r-new' });
    const res = await postReview(
      jsonRequest('http://localhost/api/reviews', {
        animeSlug: 'shadow-blade',
        rating: 9,
        comment: '  Animasi luar biasa!\u0007  ',
      })
    );
    expect(res.status).toBe(201);
    const data = dbMock.serverReview.create.mock.calls[0][0].data;
    expect(data.rating).toBe(9);
    expect(data.comment).toBe('Animasi luar biasa!');
  });
});
