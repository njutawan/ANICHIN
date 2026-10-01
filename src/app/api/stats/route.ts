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
    const [totalAnime, ongoing, totalEpisodes, trendingCount, completed, movies] = await Promise.all([
      db.anime.count(),
      db.anime.count({ where: { status: 'Ongoing' } }),
      db.episode.count(),
      db.anime.count({ where: { trending: true } }),
      db.anime.count({ where: { status: 'Completed' } }),
      db.anime.count({ where: { type: 'Movie' } }),
    ]);
    const viewsAgg = await db.anime.aggregate({ _sum: { views: true } });
    return NextResponse.json({
      totalAnime,
      ongoing,
      completed,
      movies,
      totalEpisodes,
      trendingCount,
      totalViews: viewsAgg._sum.views ?? 0,
    });
  } catch (_e) {
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
