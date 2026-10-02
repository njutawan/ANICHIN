/**
 * Kunci query + parameter tetap untuk data homepage — satu sumber kebenaran.
 *
 * Kenapa dipisah: homepage mem-prefetch data di server (RSC) lalu menghidrasi
 * cache TanStack Query. Prefetch di server dan `useQuery` di client **wajib**
 * memakai kunci yang identik, kalau tidak data hasil prefetch tidak terpakai
 * dan browser tetap memanggil API (masalah P1-4).
 *
 * Modul ini bebas dependensi (tanpa React/Prisma) supaya aman diimpor dari
 * server component, client component, maupun test.
 */

/** Tab pada TabbedRail (Trending / Sedang Tayang / Rating Tertinggi). */
export type HomeTabId = 'trending' | 'airing' | 'rated';

export interface AnimeListParams {
  genre?: string | null;
  type?: string | null;
  status?: string | null;
  slugs?: string | null;
  sort?: string | null;
  page?: number;
  limit?: number;
}

export const homeQueryKeys = {
  breakingNews: ['breaking-news'] as const,
  latest: (page: number) => ['latest', page] as const,
  today: ['today-episodes'] as const,
  tabbedRail: (tab: HomeTabId) => ['tabbed-rail', tab] as const,
  topRatedRail: ['anime-rated'] as const,
  upcoming: ['anime-upcoming'] as const,
  seasons: ['all-anime-seasons'] as const,
  editorialPicks: ['editorial-picks'] as const,
  trailers: ['featured-trailers'] as const,
  collections: ['collections'] as const,
  genres: ['genres-list'] as const,
  popular: ['popular'] as const,
  schedule: ['schedule'] as const,
  stats: ['stats'] as const,
  /** Daftar anime pada AnimeBrowseSection (berubah saat filter/halaman diganti). */
  animeList: (genre: string, type: string, sort: string, page: number) =>
    ['anime-list', genre, type, sort, page] as const,
} as const;

/** Parameter tetap tiap rail homepage — dipakai komponen & prefetch server. */
export const HOME_QUERY_PARAMS = {
  breakingNews: { page: 1, limit: 10 } satisfies AnimeListParams & { page: number; limit: number },
  latestPage1: { page: 1, limit: 18 },
  /** AnimeBrowseSection saat pertama dibuka (tanpa filter). */
  browseDefault: { genre: 'all', type: 'all', sort: 'latest', page: 1, limit: 18 } satisfies AnimeListParams,
  trending: { sort: 'views', limit: 18 } satisfies AnimeListParams,
  airing: { status: 'Ongoing', sort: 'latest', limit: 18 } satisfies AnimeListParams,
  rated: { sort: 'score', limit: 18 } satisfies AnimeListParams,
  topRatedRail: { sort: 'score', limit: 18 } satisfies AnimeListParams,
  upcoming: { status: 'Upcoming', sort: 'score', limit: 12 } satisfies AnimeListParams,
  seasons: { limit: 100, sort: 'latest' } satisfies AnimeListParams,
  editorialPicks: { limit: 4 } satisfies AnimeListParams,
} as const;

export const HOME_TAB_PARAMS: Record<HomeTabId, AnimeListParams> = {
  trending: HOME_QUERY_PARAMS.trending,
  airing: HOME_QUERY_PARAMS.airing,
  rated: HOME_QUERY_PARAMS.rated,
};

/** Bangun URL `/api/anime?...` dari parameter — dipakai `queryFn` di client. */
export function animeListUrl(params: AnimeListParams = {}): string {
  const qs = new URLSearchParams();
  if (params.genre && params.genre !== 'all') qs.set('genre', params.genre);
  if (params.type && params.type !== 'all') qs.set('type', params.type);
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.slugs) qs.set('slugs', params.slugs);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return query ? `/api/anime?${query}` : '/api/anime';
}
