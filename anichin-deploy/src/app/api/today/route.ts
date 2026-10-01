import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

// Cache for 2 minutes
export const revalidate = 120;

export async function GET(req: NextRequest) {
  try {
    // --- Rate limiting ---
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;
    // Get episodes released in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const episodes = await db.episode.findMany({
      where: { releasedAt: { gte: twentyFourHoursAgo } },
      orderBy: { releasedAt: 'desc' },
      include: { anime: true },
    });

    return NextResponse.json({
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
    });
  } catch (_e) {
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
