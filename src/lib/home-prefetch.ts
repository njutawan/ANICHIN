/**
 * Prefetch data homepage di server (RSC) lalu hidrasi cache TanStack Query.
 *
 * Sebelumnya (P1-4) homepage memuat ~17 `useQuery` yang semuanya menembak API
 * setelah hydration: 1 kunjungan = puluhan request HTTP + query DB, tanpa
 * cache. Sekarang `src/app/page.tsx` memanggil `prefetchHomePageData()`:
 * setiap dataset diambil **sekali** lewat loader server yang sudah di-cache
 * (`src/lib/data/home.ts`), hasilnya disimpan ke cache query dengan kunci yang
 * sama dengan yang dipakai komponen, lalu di-dehydrate ke browser
 * (`<HydrationBoundary>`).
 *
 * Efeknya:
 * - kunjungan pertama: 0 request API dari browser untuk data homepage;
 * - request berikutnya: cache data (`unstable_cache`) masih hangat → nol
 *   query DB sampai TTL habis;
 * - data penting (episode hari ini, rilisan terbaru, statistik) tetap dikirim
 *   sebagai props agar ikut ter-render di HTML (bukan hanya di payload
 *   hydration), jadi crawler & first paint tidak menunggu JS.
 */
import { cache } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { homeQueryKeys, HOME_QUERY_PARAMS } from '@/lib/queries/home';
import { EDITORIAL_SLUGS } from '@/lib/editorial';
import {
  getCollections,
  getFeatured,
  getGenres,
  getLatestEpisodes,
  getPopular,
  getSchedule,
  getStats,
  getTodayEpisodes,
  listAnime,
} from '@/lib/data/home';
import type {
  AnimeListPayload,
  CollectionsPayload,
  FeaturedPayload,
  GenresPayload,
  LatestPayload,
  PopularPayload,
  SchedulePayload,
  StatsPayload,
  TodayPayload,
} from '@/lib/types';

/** Semua data yang dipakai homepage — juga dipakai sebagai props initialData. */
export interface HomePageData {
  breaking: LatestPayload;
  latest: LatestPayload;
  today: TodayPayload;
  trending: AnimeListPayload;
  airing: AnimeListPayload;
  rated: AnimeListPayload;
  topRated: AnimeListPayload;
  upcoming: AnimeListPayload;
  seasons: AnimeListPayload;
  browse: AnimeListPayload;
  editorial: AnimeListPayload;
  trailers: FeaturedPayload;
  collections: CollectionsPayload;
  genres: GenresPayload;
  popular: PopularPayload;
  schedule: SchedulePayload;
  stats: StatsPayload;
}



/**
 * QueryClient per request (server). `cache()` dari React memastikan satu
 * instance per render request, bukan global (data user tidak bocor antar
 * request).
 */
export const getServerQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          // Sama dengan Providers di client → data hasil prefetch dianggap
          // fresh saat hydration sehingga tidak memicu refetch.
          staleTime: 60_000,
          retry: false,
        },
      },
    })
);

/** Payload kosong — dipakai bila satu dataset gagal diambil (DB down dsb). */
const EMPTY = {
  latest: { episodes: [], total: 0, page: 1, totalPages: 0 } as LatestPayload,
  today: { episodes: [], total: 0 } as TodayPayload,
  list: { animes: [], total: 0, page: 1, limit: 18, totalPages: 0 } as AnimeListPayload,
  featured: { featured: [] } as FeaturedPayload,
  collections: { collections: [] } as CollectionsPayload,
  genres: { genres: [] } as GenresPayload,
  popular: { popular: [] } as PopularPayload,
  schedule: { schedule: {}, days: [] } as SchedulePayload,
  stats: {
    totalAnime: 0,
    ongoing: 0,
    completed: 0,
    movies: 0,
    totalEpisodes: 0,
    trendingCount: 0,
    totalViews: 0,
  } as StatsPayload,
};

/** Nama dataset per indeks — dipakai di log kegagalan supaya mudah ditelusuri. */
const DATASET_NAMES = [
  'breaking-news',
  'latest',
  'today',
  'tabbed-rail:trending',
  'tabbed-rail:airing',
  'tabbed-rail:rated',
  'top-rated-rail',
  'upcoming',
  'seasons',
  'browse',
  'editorial-picks',
  'trailers',
  'collections',
  'genres',
  'popular',
  'schedule',
  'stats',
] as const;

/** Payload kosong berurutan sesuai `DATASET_NAMES` (dipakai saat loader gagal). */
const EMPTY_FALLBACKS = [
  EMPTY.latest,
  EMPTY.latest,
  EMPTY.today,
  EMPTY.list,
  EMPTY.list,
  EMPTY.list,
  EMPTY.list,
  EMPTY.list,
  EMPTY.list,
  EMPTY.list,
  EMPTY.list,
  EMPTY.featured,
  EMPTY.collections,
  EMPTY.genres,
  EMPTY.popular,
  EMPTY.schedule,
  EMPTY.stats,
] as const;

/**
 * Urutan pengambilan data homepage. Dipakai bersama `EMPTY_FALLBACKS` supaya
 * slot kegagalan selalu berpasangan dengan payload kosong yang tepat.
 */
type HomeDataTuple = [
  LatestPayload,
  LatestPayload,
  TodayPayload,
  AnimeListPayload,
  AnimeListPayload,
  AnimeListPayload,
  AnimeListPayload,
  AnimeListPayload,
  AnimeListPayload,
  AnimeListPayload,
  AnimeListPayload,
  FeaturedPayload,
  CollectionsPayload,
  GenresPayload,
  PopularPayload,
  SchedulePayload,
  StatsPayload,
];

/**
 * Ambil semua data homepage secara paralel dan isikan ke cache query.
 *
 * Mengembalikan objek yang sama agar komponen penting bisa menerimanya
 * sebagai `initialData` (ter-render di HTML).
 *
 * Ketahanan: satu dataset gagal (mis. DB down) tidak boleh menjatuhkan seluruh
 * halaman. Dulu kegagalan DB hanya membuat satu seksi klien kosong; dengan
 * `allSettled` + payload kosong, perilaku itu dipertahankan.
 */
export async function prefetchHomePageData(qc: QueryClient): Promise<HomePageData> {
  const settled = await Promise.allSettled([
    getLatestEpisodes(HOME_QUERY_PARAMS.breakingNews.page, HOME_QUERY_PARAMS.breakingNews.limit),
    getLatestEpisodes(HOME_QUERY_PARAMS.latestPage1.page, HOME_QUERY_PARAMS.latestPage1.limit),
    getTodayEpisodes(),
    listAnime(HOME_QUERY_PARAMS.trending),
    listAnime(HOME_QUERY_PARAMS.airing),
    listAnime(HOME_QUERY_PARAMS.rated),
    listAnime(HOME_QUERY_PARAMS.topRatedRail),
    listAnime(HOME_QUERY_PARAMS.upcoming),
    listAnime(HOME_QUERY_PARAMS.seasons),
    listAnime(HOME_QUERY_PARAMS.browseDefault),
    listAnime({ ...HOME_QUERY_PARAMS.editorialPicks, slugs: EDITORIAL_SLUGS }),
    getFeatured(),
    getCollections(),
    getGenres(),
    getPopular(),
    getSchedule(),
    getStats(),
  ]);

  const [
    breaking,
    latest,
    today,
    trending,
    airing,
    rated,
    topRated,
    upcoming,
    seasons,
    browse,
    editorial,
    trailers,
    collections,
    genres,
    popular,
    schedule,
    stats,
  ]: HomeDataTuple = settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    logger.error('Gagal memuat data homepage (memakai payload kosong)', {
      module: 'home-prefetch',
      dataset: DATASET_NAMES[i] ?? `#${i}`,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
    return EMPTY_FALLBACKS[i];
  }) as HomeDataTuple;

  // Isi cache dengan kunci yang sama persis dengan yang dipakai komponen.
  //
  // CATATAN: `breaking`, `latest`, `today`, `popular`, `schedule`, dan `stats`
  // TIDAK dimasukkan ke sini karena dikirim sebagai props `initialData` ke
  // komponennya. Kalau keduanya diisi, payload yang sama terkirim dua kali
  // (props + state hydration) sehingga HTML membengkak tanpa manfaat.
  qc.setQueryData(homeQueryKeys.tabbedRail('trending'), trending);
  qc.setQueryData(homeQueryKeys.tabbedRail('airing'), airing);
  qc.setQueryData(homeQueryKeys.tabbedRail('rated'), rated);
  qc.setQueryData(homeQueryKeys.topRatedRail, topRated);
  qc.setQueryData(homeQueryKeys.upcoming, upcoming);
  qc.setQueryData(homeQueryKeys.seasons, seasons);
  qc.setQueryData(
    homeQueryKeys.animeList(
      HOME_QUERY_PARAMS.browseDefault.genre ?? 'all',
      HOME_QUERY_PARAMS.browseDefault.type ?? 'all',
      HOME_QUERY_PARAMS.browseDefault.sort ?? 'latest',
      HOME_QUERY_PARAMS.browseDefault.page ?? 1
    ),
    browse
  );
  qc.setQueryData(homeQueryKeys.editorialPicks, editorial);
  qc.setQueryData(homeQueryKeys.trailers, trailers);
  qc.setQueryData(homeQueryKeys.collections, collections);
  qc.setQueryData(homeQueryKeys.genres, genres);

  // Enam dataset ini dikirim sebagai props (lihat catatan di atas).
  return {
    breaking,
    latest,
    today,
    trending,
    airing,
    rated,
    topRated,
    upcoming,
    seasons,
    browse,
    editorial,
    trailers,
    collections,
    genres,
    popular,
    schedule,
    stats,
  };
}
