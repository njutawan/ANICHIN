/**
 * Unit test loader data homepage (P1-4).
 *
 * Loader ini sekarang satu-satunya implementasi query untuk /api/latest,
 * /api/anime, /api/genres, dst — sekaligus sumber data prefetch RSC. Test di
 * sini mengunci parameter query (filter/sort/paginasi) dan bentuk keluaran
 * (tanggal jadi string ISO seperti respons HTTP) supaya route API dan prefetch
 * tidak pernah berbeda hasil.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const animeFindMany = vi.fn();
const animeCount = vi.fn();
const animeAggregate = vi.fn();
const episodeFindMany = vi.fn();
const episodeCount = vi.fn();
const genreFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    anime: {
      findMany: (...args: unknown[]) => animeFindMany(...args),
      count: (...args: unknown[]) => animeCount(...args),
      aggregate: (...args: unknown[]) => animeAggregate(...args),
    },
    episode: {
      findMany: (...args: unknown[]) => episodeFindMany(...args),
      count: (...args: unknown[]) => episodeCount(...args),
    },
    genre: {
      findMany: (...args: unknown[]) => genreFindMany(...args),
    },
  },
}));

import {
  getGenres,
  getLatestEpisodes,
  getStats,
  getTodayEpisodes,
  listAnime,
} from './home';

const RELEASED = new Date('2026-10-01T10:00:00.000Z');

function animeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    slug: 'shadow-blade',
    title: 'Shadow Blade',
    poster: '/anime/shadow-blade.svg',
    type: 'TV',
    status: 'Ongoing',
    score: 9.2,
    views: 1000,
    featured: true,
    trending: true,
    popular: true,
    synopsis: 'Sinopsis',
    createdAt: RELEASED,
    updatedAt: RELEASED,
    genres: [{ genre: { name: 'Action' } }, { genre: { name: 'Fantasy' } }],
    ...overrides,
  };
}

function episodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    number: 3,
    title: 'Episode 3',
    thumbnail: '/thumb.jpg',
    duration: '24m',
    releasedAt: RELEASED,
    views: 12,
    streamUrl: 'https://cdn/x.m3u8',
    anime: {
      slug: 'shadow-blade',
      title: 'Shadow Blade',
      titleJp: '影の刃',
      poster: '/anime/shadow-blade.svg',
      type: 'TV',
      status: 'Ongoing',
      releasedEpisodes: 3,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  animeCount.mockResolvedValue(0);
  episodeCount.mockResolvedValue(0);
  animeAggregate.mockResolvedValue({ _sum: { views: null } });
});

describe('listAnime', () => {
  it('menerapkan default: urut updatedAt desc (sort=latest), skip 0, take 18, sertakan genre', async () => {
    animeFindMany.mockResolvedValue([animeRow()]);
    animeCount.mockResolvedValue(1);

    const payload = await listAnime({});

    expect(animeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 18,
        include: { genres: { include: { genre: true } } },
      })
    );
    expect(payload.total).toBe(1);
    expect(payload.totalPages).toBe(1);
    // genre dipetakan ke nama (bukan objek relasi)
    expect(payload.animes[0].genres).toEqual(['Action', 'Fantasy']);
  });

  it('menerjemahkan filter genre/type/status/slugs ke klausa where', async () => {
    animeFindMany.mockResolvedValue([]);
    await listAnime({ genre: 'action', type: 'TV', status: 'Ongoing', slugs: 'a,b' });

    expect(animeFindMany.mock.calls[0][0].where).toEqual({
      type: 'TV',
      status: 'Ongoing',
      genres: { some: { genre: { slug: 'action' } } },
      slug: { in: ['a', 'b'] },
    });
  });

  it('mengabaikan nilai "all" dan menghitung skip dari halaman', async () => {
    animeFindMany.mockResolvedValue([]);
    await listAnime({ genre: 'all', type: 'all', status: 'all', page: 3, limit: 18 });

    const args = animeFindMany.mock.calls[0][0];
    expect(args.where).toEqual({});
    expect(args.skip).toBe(36);
  });

  it('mendukung urutan sort=score|views|title|latest', async () => {
    animeFindMany.mockResolvedValue([]);
    for (const [sort, expected] of [
      ['score', { score: 'desc' }],
      ['views', { views: 'desc' }],
      ['title', { title: 'asc' }],
      ['latest', { updatedAt: 'desc' }],
    ] as const) {
      await listAnime({ sort });
      expect(animeFindMany.mock.calls.at(-1)?.[0].orderBy).toEqual(expected);
    }
  });

  it('membatasi limit maksimum 48 (sama dengan route API)', async () => {
    animeFindMany.mockResolvedValue([]);
    await listAnime({ limit: 100 });
    expect(animeFindMany.mock.calls[0][0].take).toBe(48);
  });

  it('menormalkan tanggal menjadi string ISO seperti respons JSON', async () => {
    animeFindMany.mockResolvedValue([animeRow()]);
    const payload = await listAnime({});
    expect(typeof (payload.animes[0] as unknown as { createdAt: unknown }).createdAt).toBe('string');
    expect((payload.animes[0] as unknown as { createdAt: string }).createdAt).toBe(
      RELEASED.toISOString()
    );
  });
});

describe('getLatestEpisodes', () => {
  it('mengambil episode terbaru + menghitung totalPages', async () => {
    episodeFindMany.mockResolvedValue([episodeRow()]);
    episodeCount.mockResolvedValue(37);

    const payload = await getLatestEpisodes(2, 18);

    expect(episodeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 18, take: 18, orderBy: { releasedAt: 'desc' } })
    );
    expect(payload.total).toBe(37);
    expect(payload.totalPages).toBe(3);
    expect(payload.page).toBe(2);
    // releasedAt diserialisasi agar sama dengan JSON API
    expect(payload.episodes[0].releasedAt).toBe(RELEASED.toISOString());
    expect(payload.episodes[0].anime.slug).toBe('shadow-blade');
  });
});

describe('getTodayEpisodes', () => {
  it('memfilter 24 jam terakhir dan mengembalikan total = jumlah item', async () => {
    episodeFindMany.mockResolvedValue([episodeRow(), episodeRow({ id: 'e2' })]);
    const payload = await getTodayEpisodes();

    const where = episodeFindMany.mock.calls[0][0].where;
    expect(where.releasedAt.gte).toBeInstanceOf(Date);
    expect(Date.now() - where.releasedAt.gte.getTime()).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(payload.total).toBe(2);
  });
});

describe('getGenres', () => {
  it('memetakan _count ke field count', async () => {
    genreFindMany.mockResolvedValue([
      { id: 'g1', name: 'Action', slug: 'action', _count: { animes: 5 } },
    ]);
    const payload = await getGenres();
    expect(payload.genres).toEqual([{ id: 'g1', name: 'Action', slug: 'action', count: 5 }]);
  });
});

describe('getStats', () => {
  it('memakai 0 saat agregat views null', async () => {
    animeAggregate.mockResolvedValue({ _sum: { views: null } });
    const payload = await getStats();
    expect(payload.totalViews).toBe(0);
    expect(payload).toMatchObject({ totalAnime: 0, ongoing: 0, completed: 0, movies: 0 });
  });
});
