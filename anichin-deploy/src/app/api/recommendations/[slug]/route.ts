import { checkRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Cache for 5 minutes (300 seconds) — data changes infrequently
export const revalidate = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    // --- Rate limiting ---
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;
    const { slug } = await params;
    const anime = await db.anime.findUnique({
      where: { slug },
      include: { genres: { include: { genre: true } } },
    });
    if (!anime) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const genreIds = anime.genres.map((g) => g.genreId);
    if (genreIds.length === 0) {
      // Fallback: return random popular
      const recs = await db.anime.findMany({
        where: { slug: { not: slug } },
        orderBy: { views: 'desc' },
        take: 6,
      });
      return NextResponse.json({ recommendations: recs });
    }

    // Find anime sharing at least 1 genre, exclude self, sort by shared-genre count then views
    const candidates = await db.anime.findMany({
      where: {
        slug: { not: slug },
        genres: { some: { genreId: { in: genreIds } } },
      },
      include: {
        genres: { include: { genre: true } },
      },
      take: 30,
    });

    const scored = candidates
      .map((c) => {
        const shared = c.genres.filter((g) => genreIds.includes(g.genreId)).length;
        return { ...c, _shared: shared };
      })
      .sort((a, b) => {
        if (b._shared !== a._shared) return b._shared - a._shared;
        return b.views - a.views;
      })
      .slice(0, 6);

    return NextResponse.json({
      recommendations: scored.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        titleJp: c.titleJp,
        titleEn: c.titleEn,
        poster: c.poster,
        type: c.type,
        status: c.status,
        score: c.score,
        views: c.views,
        rank: c.rank,
        releasedEpisodes: c.releasedEpisodes,
        totalEpisodes: c.totalEpisodes,
        genres: c.genres.map((g) => g.genre.name),
        synopsis: c.synopsis,
        featured: c.featured,
        trending: c.trending,
        popular: c.popular,
        studio: c.studio,
        source: c.source,
        releasedYear: c.releasedYear,
        season: c.season,
        rating: c.rating,
        duration: c.duration,
        airedDay: c.airedDay,
        banner: c.banner,
      })),
    });
  } catch (_e) {
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
