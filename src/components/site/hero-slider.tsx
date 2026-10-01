import { db } from '@/lib/db';
import { HeroSliderClient } from './hero-slider-client';
import type { AnimeCardData } from '@/lib/types';

/**
 * Server Component — fetches featured anime from database.
 * Renders H1 + slide images in SSR HTML (Google can read without JS).
 *
 * Passes data to client component for slide navigation interactivity.
 */
export async function HeroSlider() {
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
