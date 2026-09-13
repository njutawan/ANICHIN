import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';

// GET reviews for an anime
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const animeSlug = searchParams.get('animeSlug');

    if (!animeSlug) {
      return NextResponse.json({ reviews: [] });
    }

    const reviews = await db.serverReview.findMany({
      where: { animeSlug },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, avatar: true } },
      },
    });

    return addRateLimitHeaders(
      NextResponse.json(
        { reviews },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
      ),
      'read'
    );
  } catch {
    return NextResponse.json({ error: 'Gagal memuat ulasan.' }, { status: 500 });
  }
}

// POST a new review (requires auth)
export async function POST(req: NextRequest) {
  try {
    // Body size guard (8KB max)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 8192) {
      return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
    }

    const limited = await checkRateLimit(req, 'search');
    if (limited) return limited;

    const [session, authErr] = await requireUser(req);
    if (authErr) return authErr;

    // Parse JSON safely
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { animeSlug, rating, comment } = body as {
      animeSlug?: unknown;
      rating?: unknown;
      comment?: unknown;
    };

    // Type validation
    if (typeof animeSlug !== 'string' || typeof comment !== 'string') {
      return NextResponse.json({ error: 'Data tidak valid.' }, { status: 400 });
    }
    // Numeric type check — critical: `rating < 1` is false if rating is "abc" (NaN)
    if (typeof rating !== 'number' || !Number.isFinite(rating)) {
      return NextResponse.json({ error: 'Rating harus angka 1-10.' }, { status: 400 });
    }

    if (!animeSlug || !comment || rating === 0) {
      return NextResponse.json({ error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // Numeric range check (now safe because rating is a validated number)
    if (rating < 1 || rating > 10) {
      return NextResponse.json({ error: 'Rating harus 1-10.' }, { status: 400 });
    }
    // Reject non-integer ratings (no half-stars in our schema)
    if (!Number.isInteger(rating)) {
      return NextResponse.json({ error: 'Rating harus bilangan bulat.' }, { status: 400 });
    }

    // Slug format validation
    if (!/^[a-z0-9-]+$/.test(animeSlug) || animeSlug.length > 200) {
      return NextResponse.json({ error: 'Anime slug tidak valid.' }, { status: 400 });
    }

    if (comment.trim().length < 5) {
      return NextResponse.json({ error: 'Komen terlalu pendek.' }, { status: 400 });
    }
    if (comment.length > 2000) {
      return NextResponse.json({ error: 'Komen terlalu panjang (max 2000 char).' }, { status: 400 });
    }

    // Sanitize comment (XSS defense in depth)
    const sanitizedComment = comment
      .trim()
      .slice(0, 500)
      .replace(/\u0000/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '');

    const review = await db.serverReview.create({
      data: {
        animeSlug,
        userId: session!.user.id,
        rating,
        comment: sanitizedComment,
      },
      include: {
        user: { select: { name: true, avatar: true } },
      },
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Gagal kirim ulasan.' }, { status: 500 });
  }
}
