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
    const genres = await db.genre.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { animes: true } } },
    });
    return NextResponse.json({
      genres: genres.map(g => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        count: g._count.animes,
      })),
    });
  } catch (_e) {
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
