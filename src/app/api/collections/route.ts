import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

// Cache for 5 minutes (300 seconds) — data changes infrequently
export const revalidate = 300;

// Curated collections — themed anime groupings
const COLLECTIONS = [
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

export async function GET(req: NextRequest) {
  try {
    // --- Rate limiting ---
    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;
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
            where: {
              ...where,
              genres: { some: { genre: { slug: col.query.genre } } },
            },
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

        // Filter hidden gems: score >= 8.2 but views < 250000
        if (col.query.hiddenGems) {
          animes = animes
            .filter((a) => a.score >= 8.2 && a.views < 250000)
            .slice(0, col.query.limit);
        }

        return {
          slug: col.slug,
          title: col.title,
          subtitle: col.subtitle,
          icon: col.icon,
          accent: col.accent,
          count: animes.length,
          animes: animes.map((a) => ({
            id: a.id,
            slug: a.slug,
            title: a.title,
            titleJp: a.titleJp,
            titleEn: a.titleEn,
            poster: a.poster,
            type: a.type,
            status: a.status,
            score: a.score,
            views: a.views,
            rank: a.rank,
            releasedEpisodes: a.releasedEpisodes,
            totalEpisodes: a.totalEpisodes,
            airedDay: a.airedDay,
            studio: a.studio,
            source: a.source,
            releasedYear: a.releasedYear,
            season: a.season,
            rating: a.rating,
            duration: a.duration,
            banner: a.banner,
            featured: a.featured,
            trending: a.trending,
            popular: a.popular,
            synopsis: a.synopsis,
            genres: a.genres.map((g) => g.genre.name),
          })),
        };
      })
    );

    return NextResponse.json({ collections: result });
  } catch (_e) {
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
