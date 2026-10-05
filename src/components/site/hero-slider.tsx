import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { HeroSliderClient } from './hero-slider-client';
import type { AnimeCardData } from '@/lib/types';

/**
 * Server Component — fetches featured anime from database.
 * Renders H1 + slide images in SSR HTML (Google can read without JS).
 *
 * Passes data to client component for slide navigation interactivity.
 *
 * Ketahanan (follow-up P1-4): kalau database tidak tersedia, komponen ini
 * mengembalikan `null` **tanpa melempar error**. Sebelumnya kegagalan query
 * membuat React error boundary mengambil alih seluruh beranda, sehingga HTML
 * yang terkirim ke crawler hanya berisi skip-link — halaman "tampak 200" tapi
 * kosong. Sekarang hanya hero yang hilang; bagian lain beranda tetap dirender.
 */
export async function HeroSlider() {
  try {
    return await renderHeroSlider();
  } catch (err) {
    logger.error('HeroSlider: gagal memuat anime unggulan — hero dilewati', {
      error: err instanceof Error ? err.message : 'unknown',
      module: 'components/site/hero-slider',
    });
    return null;
  }
}

async function renderHeroSlider() {
  const featured = await db.anime.findMany({
    where: {
      OR: [{ featured: true }, { trending: true }],
    },
    orderBy: { views: 'desc' },
    take: 6,
    select: {
      id: true,
      slug: true,
      title: true,
      titleEn: true,
      titleJp: true,
      synopsis: true,
      poster: true,
      banner: true,
      type: true,
      status: true,
      studio: true,
      source: true,
      releasedYear: true,
      season: true,
      score: true,
      rating: true,
      views: true,
      duration: true,
      airedDay: true,
      trailer: true,
      featured: true,
      trending: true,
      popular: true,
      rank: true,
      totalEpisodes: true,
      releasedEpisodes: true,
      genres: { include: { genre: { select: { name: true } } } },
    },
  });

  const slides: AnimeCardData[] = featured.map((a) => ({
    ...a,
    genres: a.genres.map((g) => g.genre.name),
  }));

  if (slides.length === 0) return null;

  return <HeroSliderClient slides={slides} />;
}
