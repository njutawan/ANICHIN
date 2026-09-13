import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // --- Rate limiting ---
    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;
    const count = await db.anime.count();
    if (count === 0) return NextResponse.json({ error: 'No anime' }, { status: 404 });
    const skip = Math.floor(Math.random() * count);
    const [anime] = await db.anime.findMany({
      skip,
      take: 1,
      include: { genres: { include: { genre: true } } },
    });
    if (!anime) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      ...anime,
      genres: anime.genres.map((g) => g.genre.name),
    });
  } catch (_e) {

    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
