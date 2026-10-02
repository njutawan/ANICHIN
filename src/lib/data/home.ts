/**
 * Loader data homepage — **server-only**, di-cache dengan `unstable_cache`.
 *
 * Ini satu-satunya implementasi query untuk dataset homepage. Route API
 * (`/api/latest`, `/api/anime`, …) memanggil fungsi di sini supaya browser dan
 * server menghasilkan bentuk data yang sama persis, sementara homepage
 * (RSC) mem-prefetch-nya tanpa lewat HTTP.
 *
 * Kenapa di-cache: root layout `force-dynamic` demi nonce CSP, jadi HTML
 * dirender ulang tiap request. Tanpa cache, tiap kunjungan = puluhan query DB.
 * `unstable_cache` memisahkan cache **data** dari cache HTML: HTML tetap
 * dinamis (nonce valid), data tidak di-query ulang selama TTL.
 *
 * Contoh pemakaian:
 *   const { episodes } = await getLatestEpisodes(1, 18);
 */
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import type {
  AnimeCardData,
  AnimeListPayload,
  CollectionsPayload,
  FeaturedPayload,
  GenresPayload,
  LatestPayload,
  PopularPayload,
  RailAnime,
  SchedulePayload,
  StatsPayload,
  TodayPayload,
} from '@/lib/types';
import type { AnimeListParams } from '@/lib/queries/home';

/** Feed (episode baru) — cepat berubah. */
const FEED_REVALIDATE = 120;
/** Katalog/statistik — jarang berubah. */
const CATALOG_REVALIDATE = 300;

/**
 * Normalkan nilai agar identik dengan respons HTTP (`NextResponse.json`):
 * `Date` → string ISO, `undefined` di objek hilang. Dengan begitu data hasil
 * prefetch RSC bisa langsung dipakai komponen client yang selama ini menerima
 * JSON dari API.
 */
function toJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─────────────────────────────────────────────────────────────
// /api/anime — daftar anime (dipakai banyak rail + browse + filter)
// ─────────────────────────────────────────────────────────────

async function loadAnimeList(params: AnimeListParams): Promise<AnimeListPayload> {
  const genre = params.genre;
  const type = params.type;
  const status = params.status;
  const slugs = params.slugs;
  const sort = params.sort || 'latest';
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(48, Math.max(1, params.limit ?? 18));

  const where: Record<string, unknown> = {};
  if (type && type !== 'all') where.type = type;
  if (status && status !== 'all') where.status = status;
  if (genre && genre !== 'all') {
    where.genres = { some: { genre: { slug: genre } } };
  }
  if (slugs) {
    const arr = slugs.split(',').filter(Boolean);
    where.slug = { in: arr };
  }

  let orderBy: Record<string, string> = { createdAt: 'desc' };
  if (sort === 'score') orderBy = { score: 'desc' };
  else if (sort === 'views') orderBy = { views: 'desc' };
  else if (sort === 'title') orderBy = { title: 'asc' };
  else if (sort === 'latest') orderBy = { updatedAt: 'desc' };

  const [animes, total] = await Promise.all([
    db.anime.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: { genres: { include: { genre: true } } },
    }),
    db.anime.count({ where }),
  ]);

  return toJSON({
    animes: animes.map((a) => ({
      ...a,
      genres: a.genres.map((g) => g.genre.name),
    })) as unknown as AnimeCardData[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }) as AnimeListPayload;
}

export const listAnime = unstable_cache(
  (params: AnimeListParams) => loadAnimeList(params),
  ['home', 'anime-list'],
  { revalidate: FEED_REVALIDATE, tags: ['anime-list'] }
);

/** Varian bebas argumen-objek-berubah: cache per kombinasi parameter. */
export function listAnimeCached(params: AnimeListParams): Promise<AnimeListPayload> {
  return listAnime(params);
}

// ─────────────────────────────────────────────────────────────
// /api/latest + /api/today — feed episode
// ─────────────────────────────────────────────────────────────

async function loadLatestEpisodes(page: number, limit: number): Promise<LatestPayload> {
  const [episodes, total] = await Promise.all([
    db.episode.findMany({
      orderBy: { releasedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { anime: true },
    }),
    db.episode.count(),
  ]);

  return toJSON({
    episodes: episodes.map((e) => ({
      id: e.id,
      number: e.number,
      title: e.title,
      thumbnail: e.thumbnail,
      duration: e.duration,
      releasedAt: e.releasedAt,
      views: e.views,
      streamUrl: e.streamUrl,
      anime: {
        slug: e.anime.slug,
        title: e.anime.title,
        titleJp: e.anime.titleJp,
        poster: e.anime.poster,
        type: e.anime.type,
        status: e.anime.status,
        releasedEpisodes: e.anime.releasedEpisodes,
      },
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }) as unknown as LatestPayload;
}

export const getLatestEpisodes = unstable_cache(
  (page: number, limit: number) => loadLatestEpisodes(page, limit),
  ['home', 'latest'],
  { revalidate: FEED_REVALIDATE, tags: ['episodes'] }
);

async function loadTodayEpisodes(): Promise<TodayPayload> {
  // Episode yang rilis dalam 24 jam terakhir.
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const episodes = await db.episode.findMany({
    where: { releasedAt: { gte: twentyFourHoursAgo } },
    orderBy: { releasedAt: 'desc' },
    include: { anime: true },
  });

  return toJSON({
    episodes: episodes.map((e) => ({
      id: e.id,
      number: e.number,
      thumbnail: e.thumbnail,
      duration: e.duration,
      releasedAt: e.releasedAt,
      views: e.views,
      anime: {
        slug: e.anime.slug,
        title: e.anime.title,
        titleJp: e.anime.titleJp,
        poster: e.anime.poster,
        type: e.anime.type,
        status: e.anime.status,
        releasedEpisodes: e.anime.releasedEpisodes,
      },
    })),
    total: episodes.length,
  }) as unknown as TodayPayload;
}

export const getTodayEpisodes = unstable_cache(loadTodayEpisodes, ['home', 'today'], {
  revalidate: FEED_REVALIDATE,
  tags: ['episodes'],
});

// ─────────────────────────────────────────────────────────────
// /api/featured — hero & trailer
// ─────────────────────────────────────────────────────────────

async function loadFeatured(): Promise<FeaturedPayload> {
  const featured = await db.anime.findMany({
    where: { featured: true },
    orderBy: { rank: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      titleEn: true,
      titleJp: true,
      poster: true,
      banner: true,
      type: true,
      status: true,
      studio: true,
      releasedYear: true,
      season: true,
      score: true,
      duration: true,
      views: true,
      rank: true,
      releasedEpisodes: true,
      totalEpisodes: true,
      synopsis: true,
      featured: true,
      trending: true,
      popular: true,
      genres: { select: { genre: { select: { name: true } } } },
    },
  });

  return toJSON({
    featured: featured.map((a) => ({
      ...a,
      genres: a.genres.map((g) => g.genre.name),
    })) as unknown as AnimeCardData[],
  }) as FeaturedPayload;
}

export const getFeatured = unstable_cache(loadFeatured, ['home', 'featured'], {
  revalidate: CATALOG_REVALIDATE,
  tags: ['anime'],
});

// ─────────────────────────────────────────────────────────────
// /api/collections — koleksi kurasi
// ─────────────────────────────────────────────────────────────

interface CollectionDef {
  slug: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  query: {
    releasedYear?: number;
    genre?: string;
    sort: 'score' | 'views';
    limit: number;
    hiddenGems?: boolean;
  };
}

const COLLECTIONS: CollectionDef[] = [
  {
    slug: 'best-of-2024',
    title: 'Terbaik 2024',
    subtitle: 'Anime dengan rating tertinggi tahun 2024',
    icon: 'trophy',
    accent: '#fbbf24',
    query: { releasedYear: 2024, sort: 'score', limit: 12 },
  },
  {
    slug: 'must-watch-action',
    title: 'Wajib Tonton: Action',
    subtitle: 'Anime action terbaik yang wajib ditonton',
    icon: 'flame',
    accent: '#ef4444',
    query: { genre: 'action', sort: 'views', limit: 12 },
  },
  {
    slug: 'hidden-gems',
    title: 'Permata Tersembunyi',
    subtitle: 'Anime skor tinggi dengan views rendah',
    icon: 'gem',
    accent: '#a78bfa',
    query: { sort: 'score', limit: 12, hiddenGems: true },
  },
  {
    slug: 'fantasy-epics',
    title: 'Epik Fantasi',
    subtitle: 'Petualangan fantasi berskala besar',
    icon: 'castle',
    accent: '#c084fc',
    query: { genre: 'fantasy', sort: 'views', limit: 12 },
  },
  {
    slug: 'romance-picks',
    title: 'Pilihan Romansa',
    subtitle: 'Cerita cinta yang menyentuh hati',
    icon: 'heart',
    accent: '#fb7185',
    query: { genre: 'romance', sort: 'score', limit: 12 },
  },
  {
    slug: 'mecha-masters',
    title: 'Master Mecha',
    subtitle: 'Robot, pilot, dan pertempuran epik',
    icon: 'robot',
    accent: '#fb923c',
    query: { genre: 'mecha', sort: 'score', limit: 12 },
  },
];

async function loadCollections(): Promise<CollectionsPayload> {
  const result = await Promise.all(
    COLLECTIONS.map(async (col) => {
      const where: Record<string, unknown> = {};
      if (col.query.releasedYear) where.releasedYear = col.query.releasedYear;

      let orderBy: Record<string, string> = { score: 'desc' };
      if (col.query.sort === 'views') orderBy = { views: 'desc' };
      else if (col.query.sort === 'score') orderBy = { score: 'desc' };

      let animes;
      if (col.query.genre) {
        animes = await db.anime.findMany({
          where: { ...where, genres: { some: { genre: { slug: col.query.genre } } } },
          orderBy,
          take: col.query.limit,
          include: { genres: { include: { genre: true } } },
        });
      } else {
        animes = await db.anime.findMany({
          where,
          orderBy,
          take: col.query.limit,
          include: { genres: { include: { genre: true } } },
        });
      }

      // Filter hidden gems: skor >= 8.2 tapi views < 250000
      if (col.query.hiddenGems) {
        animes = animes.filter((a) => a.score >= 8.2 && a.views < 250000).slice(0, col.query.limit);
      }

      return {
        slug: col.slug,
        title: col.title,
        subtitle: col.subtitle,
        icon: col.icon,
        accent: col.accent,
        count: animes.length,
        animes: animes.map((a) => ({
          ...a,
          genres: a.genres.map((g) => g.genre.name),
        })),
      };
    })
  );

  return toJSON({ collections: result }) as CollectionsPayload;
}

export const getCollections = unstable_cache(loadCollections, ['home', 'collections'], {
  revalidate: CATALOG_REVALIDATE,
  tags: ['anime'],
});

// ─────────────────────────────────────────────────────────────
// /api/genres
// ─────────────────────────────────────────────────────────────

async function loadGenres(): Promise<GenresPayload> {
  const genres = await db.genre.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { animes: true } } },
  });
  return toJSON({
    genres: genres.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      count: g._count.animes,
    })),
  }) as GenresPayload;
}

export const getGenres = unstable_cache(loadGenres, ['home', 'genres'], {
  revalidate: CATALOG_REVALIDATE,
  tags: ['anime'],
});

// ─────────────────────────────────────────────────────────────
// /api/popular + /api/schedule
// ─────────────────────────────────────────────────────────────

async function loadPopular(): Promise<PopularPayload> {
  const popular = await db.anime.findMany({
    where: { popular: true },
    orderBy: { rank: 'asc' },
    take: 12,
    select: {
      slug: true,
      title: true,
      titleJp: true,
      poster: true,
      type: true,
      status: true,
      score: true,
      views: true,
      rank: true,
      releasedEpisodes: true,
      totalEpisodes: true,
      airedDay: true,
    },
  });
  return toJSON({ popular }) as PopularPayload;
}

export const getPopular = unstable_cache(loadPopular, ['home', 'popular'], {
  revalidate: CATALOG_REVALIDATE,
  tags: ['anime'],
});

async function loadSchedule(): Promise<SchedulePayload> {
  // Satu query lalu dikelompokkan in-memory (lebih murah dari 7 query).
  const allOngoing = await db.anime.findMany({
    where: { status: 'Ongoing', airedDay: { not: null } },
    orderBy: { score: 'desc' },
    select: {
      slug: true,
      title: true,
      titleJp: true,
      poster: true,
      type: true,
      score: true,
      releasedEpisodes: true,
      totalEpisodes: true,
      airedDay: true,
    },
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const schedule: Record<string, RailAnime[]> = {};
  for (const day of days) {
    schedule[day] = allOngoing.filter((a) => a.airedDay === day);
  }

  return toJSON({ schedule, days }) as SchedulePayload;
}

export const getSchedule = unstable_cache(loadSchedule, ['home', 'schedule'], {
  revalidate: CATALOG_REVALIDATE,
  tags: ['anime'],
});

// ─────────────────────────────────────────────────────────────
// /api/stats
// ─────────────────────────────────────────────────────────────

async function loadStats(): Promise<StatsPayload> {
  const [totalAnime, ongoing, totalEpisodes, trendingCount, completed, movies] = await Promise.all([
    db.anime.count(),
    db.anime.count({ where: { status: 'Ongoing' } }),
    db.episode.count(),
    db.anime.count({ where: { trending: true } }),
    db.anime.count({ where: { status: 'Completed' } }),
    db.anime.count({ where: { type: 'Movie' } }),
  ]);
  const viewsAgg = await db.anime.aggregate({ _sum: { views: true } });

  return {
    totalAnime,
    ongoing,
    completed,
    movies,
    totalEpisodes,
    trendingCount,
    totalViews: viewsAgg._sum.views ?? 0,
  };
}

export const getStats = unstable_cache(loadStats, ['home', 'stats'], {
  revalidate: CATALOG_REVALIDATE,
  tags: ['stats'],
});
