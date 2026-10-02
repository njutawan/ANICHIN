

export interface AnimeCardData {
  id: string;
  slug: string;
  title: string;
  titleEn?: string | null;
  titleJp?: string | null;
  poster: string;
  banner?: string | null;
  type: string;
  status: string;
  studio?: string | null;
  source?: string | null;
  releasedYear?: number | null;
  season?: string | null;
  score: number;
  rating?: string | null;
  views: number;
  duration?: string | null;
  airedDay?: string | null;
  featured: boolean;
  trending: boolean;
  popular: boolean;
  rank?: number | null;
  totalEpisodes?: number | null;
  releasedEpisodes?: number | null;
  genres: string[];
  synopsis: string;
}

export interface EpisodeData {
  id: string;
  number: number;
  title?: string | null;
  thumbnail?: string | null;
  duration?: string | null;
  releasedAt: string;
  views: number;
  streamUrl?: string | null;
  download480?: string | null;
  download720?: string | null;
  download1080?: string | null;
  anime: {
    slug: string;
    title: string;
    titleJp?: string | null;
    poster: string;
    type: string;
    status: string;
    releasedEpisodes?: number | null;
  };
}

export interface CharacterData {
  id: string;
  slug: string;
  name: string;
  nameJp?: string | null;
  role?: string | null;
  description?: string | null;
  image?: string | null;
}

export interface StaffData {
  id: string;
  slug: string;
  name: string;
  nameJp?: string | null;
  role?: string | null;
  image?: string | null;
}

export interface AnimeRelation {
  anime: AnimeCardData;
  relation: string; // Sequel, Prequel, Side Story, Alternative, Spin-off, Parent Story
}

export interface AnimeDetail extends AnimeCardData {
  episodes: EpisodeData[];
  trailer?: string | null;
  alternativeTitle?: string | null;
  createdAt: string;
  characters: CharacterData[];
  staff: StaffData[];
  relations: AnimeRelation[];
}

export interface GenreData {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/**
 * Format a date as a relative "time ago" string.
 *
 * Pass an optional `t` translator (from `useI18n()`) to localize the output.
 * Without `t`, falls back to Indonesian (kept for backward compatibility with
 * any non-component callers).
 *
 * Interpolation expects templates like `'{n} menit lalu'` and substitutes
 * the `{n}` placeholder with the computed count.
 */
export function timeAgo(date: string | number | Date, t?: (key: string) => string): string {
  const tr = (key: string) => (t ? t(key) : '');
  const justNow = t ? tr('common.justNow') : 'baru saja';
  if (date == null) return justNow;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return justNow;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return justNow;
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return t ? tr('common.minutesAgo').replace('{n}', String(min)) : `${min} menit lalu`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return t ? tr('common.hoursAgo').replace('{n}', String(hr)) : `${hr} jam lalu`;
  }
  const day = Math.floor(hr / 24);
  if (day < 7) {
    return t ? tr('common.daysAgo').replace('{n}', String(day)) : `${day} hari lalu`;
  }
  const wk = Math.floor(day / 7);
  if (wk < 4) {
    return t ? tr('common.weeksAgo').replace('{n}', String(wk)) : `${wk} minggu lalu`;
  }
  const mo = Math.floor(day / 30);
  if (mo < 12) {
    return t ? tr('common.monthsAgo').replace('{n}', String(mo)) : `${mo} bulan lalu`;
  }
  const yr = Math.floor(day / 365);
  return t ? tr('common.yearsAgo').replace('{n}', String(yr)) : `${yr} tahun lalu`;
}

export const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Bentuk payload yang dikembalikan endpoint publik + loader server
 * (src/lib/data/home.ts). Ditulis eksplisit supaya prefetch RSC dan
 * komponen client tidak bisa "diam-diam" berbeda bentuk.
 */
export interface AnimeListPayload {
  animes: AnimeCardData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LatestPayload {
  episodes: EpisodeData[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TodayPayload {
  episodes: EpisodeData[];
  total: number;
}

export interface GenresPayload {
  genres: { id: string; name: string; slug: string; count: number }[];
}

/** Anime ringkas untuk rail ranking (/api/popular, /api/schedule). */
export interface RailAnime {
  slug: string;
  title: string;
  titleJp?: string | null;
  poster: string;
  type: string;
  status?: string;
  score: number;
  views?: number;
  rank?: number | null;
  releasedEpisodes?: number | null;
  totalEpisodes?: number | null;
  airedDay?: string | null;
}

export interface PopularPayload {
  popular: RailAnime[];
}

export interface SchedulePayload {
  schedule: Record<string, RailAnime[]>;
  days: string[];
}

export interface StatsPayload {
  totalAnime: number;
  ongoing: number;
  completed: number;
  movies: number;
  totalEpisodes: number;
  trendingCount: number;
  totalViews: number;
}

export interface FeaturedPayload {
  featured: AnimeCardData[];
}

export interface CollectionEntry {
  slug: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  count: number;
  animes: AnimeCardData[];
}

export interface CollectionsPayload {
  collections: CollectionEntry[];
}
