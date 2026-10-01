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
    // Single query instead of 7 separate queries — fetch all ongoing anime with airedDay
    const allOngoing = await db.anime.findMany({
      where: { status: 'Ongoing', airedDay: { not: null } },
      orderBy: { score: 'desc' },
      select: {
        slug: true, title: true, titleJp: true, poster: true,
        type: true, score: true, releasedEpisodes: true, totalEpisodes: true, airedDay: true,
      },
    });

    // Group by day in-memory (much faster than 7 DB queries)
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const schedule: Record<string, typeof allOngoing> = {};
    for (const day of days) {
      schedule[day] = allOngoing.filter(a => a.airedDay === day);
    }

    return NextResponse.json({ schedule, days });
  } catch {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
