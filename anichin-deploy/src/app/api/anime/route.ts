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
    const genre = searchParams.get('genre');
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const slugs = searchParams.get('slugs');
    const sort = searchParams.get('sort') || 'latest';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(48, Math.max(1, parseInt(searchParams.get('limit') || '18', 10)));

    const where: Record<string, unknown> = {};
    if (type && type !== 'all') where.type = type;
    if (status && status !== 'all') where.status = status;
    if (genre && genre !== 'all') {
      where.genres = { some: { genre: { slug: genre } } };
    }
    if (slugs) {
      const arr = slugs.split(',').filter(Boolean);
      where.slug = { in: arr };
    }

    let orderBy: Record<string, string> = { createdAt: 'desc' };
    if (sort === 'score') orderBy = { score: 'desc' };
    else if (sort === 'views') orderBy = { views: 'desc' };
    else if (sort === 'title') orderBy = { title: 'asc' };
    else if (sort === 'latest') orderBy = { updatedAt: 'desc' };

    const [animes, total] = await Promise.all([
      db.anime.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { genres: { include: { genre: true } } },
      }),
      db.anime.count({ where }),
    ]);

    return NextResponse.json({
      animes: animes.map(a => ({
        ...a,
        genres: a.genres.map(g => g.genre.name),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (_e) {
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
