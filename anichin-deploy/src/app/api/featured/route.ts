import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

// Cache for 5 minutes (300 seconds) — data changes infrequently
export const revalidate = 300;

export async function GET(req: NextRequest) {
  try {
    // --- Rate limiting ---
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;
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
    return NextResponse.json({
      featured: featured.map(a => ({
        ...a,
        genres: a.genres.map(g => g.genre.name),
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
