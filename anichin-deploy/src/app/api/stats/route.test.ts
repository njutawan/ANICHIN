/**
 * API tests for GET /api/stats.
 *
 * Covers:
 *   - Returns 200 with correct anime / episode / views counts
 *   - Calls each underlying Prisma query exactly once
 *   - Computes trendingCount, ongoing, completed, movies correctly
 *   - Returns 500 with a generic error message when the DB throws
 *   - Passes through the 429 response when rate-limited
 *
 * Mocks:
 *   - @/lib/db → PrismaClient stub with anime.count / episode.count / anime.aggregate
 *   - @/lib/rate-limit → checkRateLimit spy (returns null or a 429 response)
 *
 * Runs in the node environment — no DB connection is opened.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { dbMock, checkRateLimitMock } = vi.hoisted(() => ({
  dbMock: {
    anime: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    episode: {
      count: vi.fn(),
    },
  },
  checkRateLimitMock: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));

// ── Component under test ────────────────────────────────────────────────────

import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/stats');
}

describe('GET /api/stats', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    dbMock.anime.count.mockReset();
    dbMock.anime.aggregate.mockReset();
    dbMock.episode.count.mockReset();

    // Default: not rate-limited.
    checkRateLimitMock.mockResolvedValue(null);
  });

  it('returns 200 with correct anime / episode / views counts', async () => {
    // First count is totalAnime, then ongoing, then trending, then completed, then movies.
    dbMock.anime.count
      .mockResolvedValueOnce(24) // totalAnime
      .mockResolvedValueOnce(10) // ongoing
      .mockResolvedValueOnce(5)  // trendingCount
      .mockResolvedValueOnce(14) // completed
      .mockResolvedValueOnce(3); // movies
    dbMock.episode.count.mockResolvedValue(223);
    dbMock.anime.aggregate.mockResolvedValue({ _sum: { views: 9_876_543 } });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      totalAnime: 24,
      ongoing: 10,
      completed: 14,
      movies: 3,
      totalEpisodes: 223,
      trendingCount: 5,
      totalViews: 9_876_543,
    });
  });

  it('uses 0 for totalViews when the aggregate returns null', async () => {
    dbMock.anime.count.mockResolvedValue(0);
    dbMock.episode.count.mockResolvedValue(0);
    dbMock.anime.aggregate.mockResolvedValue({ _sum: { views: null } });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.totalViews).toBe(0);
  });

  it('calls each Prisma query exactly once with the expected filters', async () => {
    dbMock.anime.count.mockResolvedValue(0);
    dbMock.episode.count.mockResolvedValue(0);
    dbMock.anime.aggregate.mockResolvedValue({ _sum: { views: 0 } });

    await GET(makeReq());

    // 5 anime.count calls: total, ongoing, trending, completed, movies.
    expect(dbMock.anime.count).toHaveBeenCalledTimes(5);
    expect(dbMock.episode.count).toHaveBeenCalledTimes(1);
    expect(dbMock.anime.aggregate).toHaveBeenCalledTimes(1);

    // Verify the filter clauses are passed correctly.
    expect(dbMock.anime.count).toHaveBeenCalledWith();                       // totalAnime
    expect(dbMock.anime.count).toHaveBeenCalledWith({ where: { status: 'Ongoing' } });
    expect(dbMock.anime.count).toHaveBeenCalledWith({ where: { trending: true } });
    expect(dbMock.anime.count).toHaveBeenCalledWith({ where: { status: 'Completed' } });
    expect(dbMock.anime.count).toHaveBeenCalledWith({ where: { type: 'Movie' } });
    expect(dbMock.anime.aggregate).toHaveBeenCalledWith({ _sum: { views: true } });
  });

  it('passes the rate-limit type "read" to checkRateLimit', async () => {
    dbMock.anime.count.mockResolvedValue(0);
    dbMock.episode.count.mockResolvedValue(0);
    dbMock.anime.aggregate.mockResolvedValue({ _sum: { views: 0 } });

    const req = makeReq();
    await GET(req);

    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    expect(checkRateLimitMock).toHaveBeenCalledWith(req, 'read');
  });

  it('returns the 429 response directly when the rate limiter trips', async () => {
    const limited = NextResponse.json(
      { error: 'Terlalu banyak permintaan. Coba lagi nanti.', retryAfter: 60 },
      { status: 429 }
    );
    checkRateLimitMock.mockResolvedValue(limited);

    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    // Should NOT have touched the DB if rate-limited.
    expect(dbMock.anime.count).not.toHaveBeenCalled();
    expect(dbMock.episode.count).not.toHaveBeenCalled();
    expect(dbMock.anime.aggregate).not.toHaveBeenCalled();
  });

  it('returns 500 with a generic error message when the DB throws', async () => {
    dbMock.anime.count.mockRejectedValue(new Error('DB connection lost'));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error. Please try again.' });
    // No internal error details should leak.
    expect(JSON.stringify(body)).not.toContain('DB connection lost');
  });

  it('returns 500 when db.anime.aggregate throws (after counts succeed)', async () => {
    dbMock.anime.count.mockResolvedValue(1);
    dbMock.episode.count.mockResolvedValue(1);
    dbMock.anime.aggregate.mockRejectedValue(new Error('aggregate failed'));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error. Please try again.');
  });

  it('returns 500 when db.episode.count throws', async () => {
    dbMock.anime.count.mockResolvedValue(1);
    dbMock.episode.count.mockRejectedValue(new Error('episode query failed'));
    dbMock.anime.aggregate.mockResolvedValue({ _sum: { views: 0 } });

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});
