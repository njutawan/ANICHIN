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
    return NextResponse.json({ popular });
  } catch (_e) {
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
