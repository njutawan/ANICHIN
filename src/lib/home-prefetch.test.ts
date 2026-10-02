/**
 * Unit test prefetch homepage (P1-4).
 *
 * Menguji bahwa `prefetchHomePageData` mengisi cache query dengan **kunci yang
 * sama** dengan yang dipakai komponen, mengembalikan data untuk props RSC, dan
 * tidak menduplikasi data yang sudah dikirim sebagai props ke state hydration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { homeQueryKeys, HOME_QUERY_PARAMS } from '@/lib/queries/home';
import { EDITORIAL_SLUGS } from '@/lib/editorial';
import type { LatestPayload } from '@/lib/types';

const listAnime = vi.fn(async (params: Record<string, unknown>) => ({
  animes: [{ slug: 'x', params }],
  total: 1,
  page: 1,
  limit: 18,
  totalPages: 1,
}));

vi.mock('@/lib/data/home', () => ({
  getLatestEpisodes: vi.fn(async (page: number, limit: number): Promise<LatestPayload> => ({
    episodes: [{ id: `ep-${page}-${limit}` }],
    total: 1,
    page,
    totalPages: 1,
  })),
  getTodayEpisodes: vi.fn(async () => ({ episodes: [{ id: 'today' }], total: 1 })),
  listAnime: (params: Record<string, unknown>) => listAnime(params),
  getFeatured: vi.fn(async () => ({ featured: [{ slug: 'hero' }] })),
  getCollections: vi.fn(async () => ({ collections: [{ slug: 'c1' }] })),
  getGenres: vi.fn(async () => ({ genres: [{ id: 'g1', name: 'Action', slug: 'action', count: 3 }] })),
  getPopular: vi.fn(async () => ({ popular: [{ slug: 'p1' }] })),
  getSchedule: vi.fn(async () => ({ schedule: { Monday: [] }, days: ['Monday'] })),
  getStats: vi.fn(async () => ({
    totalAnime: 1,
    ongoing: 1,
    completed: 0,
    movies: 0,
    totalEpisodes: 1,
    trendingCount: 1,
    totalViews: 10,
  })),
}));

import { getGenres } from '@/lib/data/home';
import { prefetchHomePageData } from './home-prefetch';

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('prefetchHomePageData', () => {
  it('mengisi cache dengan kunci yang dipakai komponen (tanpa request browser)', async () => {
    const qc = newClient();
    await prefetchHomePageData(qc);

    // Rail & seksi yang mengandalkan hydration.
    expect(qc.getQueryData(homeQueryKeys.tabbedRail('trending'))).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.tabbedRail('airing'))).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.tabbedRail('rated'))).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.topRatedRail)).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.upcoming)).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.seasons)).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.editorialPicks)).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.trailers)).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.collections)).toBeDefined();
    expect(qc.getQueryData(homeQueryKeys.genres)).toBeDefined();
    expect(
      qc.getQueryData(
        homeQueryKeys.animeList(
          HOME_QUERY_PARAMS.browseDefault.genre ?? 'all',
          HOME_QUERY_PARAMS.browseDefault.type ?? 'all',
          HOME_QUERY_PARAMS.browseDefault.sort ?? 'latest',
          HOME_QUERY_PARAMS.browseDefault.page ?? 1
        )
      )
    ).toBeDefined();
  });

  it('tidak menduplikasi dataset yang dikirim sebagai props RSC', async () => {
    const qc = newClient();
    await prefetchHomePageData(qc);

    // Enam dataset ini dioper sebagai `initialData` (sudah ada di HTML), jadi
    // sengaja TIDAK dimasukkan ke state hydration agar payload tidak dobel.
    expect(qc.getQueryData(homeQueryKeys.breakingNews)).toBeUndefined();
    expect(qc.getQueryData(homeQueryKeys.latest(1))).toBeUndefined();
    expect(qc.getQueryData(homeQueryKeys.today)).toBeUndefined();
    expect(qc.getQueryData(homeQueryKeys.popular)).toBeUndefined();
    expect(qc.getQueryData(homeQueryKeys.schedule)).toBeUndefined();
    expect(qc.getQueryData(homeQueryKeys.stats)).toBeUndefined();
  });

  it('mengembalikan data untuk props + memakai parameter yang benar', async () => {
    const qc = newClient();
    const data = await prefetchHomePageData(qc);

    expect(data.latest.episodes[0].id).toBe('ep-1-18');
    expect(data.breaking.episodes[0].id).toBe('ep-1-10');
    expect(data.today.episodes[0].id).toBe('today');
    expect(data.stats.totalAnime).toBe(1);
    expect(data.genres.genres[0].slug).toBe('action');

    const calls = listAnime.mock.calls.map(([p]) => p);
    expect(calls).toContainEqual(HOME_QUERY_PARAMS.trending);
    expect(calls).toContainEqual(HOME_QUERY_PARAMS.airing);
    expect(calls).toContainEqual(HOME_QUERY_PARAMS.rated);
    expect(calls).toContainEqual(HOME_QUERY_PARAMS.upcoming);
    expect(calls).toContainEqual(HOME_QUERY_PARAMS.seasons);
    expect(calls).toContainEqual(HOME_QUERY_PARAMS.browseDefault);
    expect(calls).toContainEqual({ ...HOME_QUERY_PARAMS.editorialPicks, slugs: EDITORIAL_SLUGS });
  });

  it('satu loader gagal → halaman tetap dapat payload kosong (bukan error)', async () => {
    vi.mocked(getGenres).mockRejectedValueOnce(new Error('db down'));
    const qc = newClient();

    const data = await prefetchHomePageData(qc);

    // Dataset lain tetap terisi…
    expect(data.stats.totalAnime).toBe(1);
    expect(data.trending.animes).toHaveLength(1);
    // …dan yang gagal memakai fallback kosong, bukan menolak seluruh render.
    expect(data.genres).toEqual({ genres: [] });
    expect(qc.getQueryData(homeQueryKeys.genres)).toEqual({ genres: [] });
  });

  it('satu dataset = satu pemanggilan loader (tidak ada query dobel)', async () => {
    const qc = newClient();
    await prefetchHomePageData(qc);
    // trending/airing/rated/topRatedRail/upcoming/seasons/browse/editorial
    expect(listAnime).toHaveBeenCalledTimes(8);
  });
});
