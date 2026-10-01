import { checkRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Cache for 2 minutes
export const revalidate = 120;

export async function GET(req: NextRequest) {
  try {
    // --- Rate limiting ---
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(60, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)));

    const [episodes, total] = await Promise.all([
      db.episode.findMany({
        orderBy: { releasedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { anime: true },
      }),
      db.episode.count(),
    ]);

    return NextResponse.json({
      episodes: episodes.map(e => ({
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
    });
  } catch (_e) {
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
