import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';

// GET comments for an episode
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const animeSlug = searchParams.get('animeSlug');
    const episodeNumber = searchParams.get('episodeNumber');

    if (!animeSlug || !episodeNumber) {
      return NextResponse.json({ comments: [] });
    }

    const comments = await db.serverComment.findMany({
      where: { animeSlug, episodeNumber: parseInt(episodeNumber, 10) },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, avatar: true } },
      },
    });

    return addRateLimitHeaders(
      NextResponse.json(
        { comments },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
      ),
      'read'
    );
  } catch {
    return NextResponse.json({ error: 'Gagal memuat komentar.' }, { status: 500 });
  }
}

// POST a new comment (requires auth)
export async function POST(req: NextRequest) {
  try {
    // Body size guard (8KB max — comments are short)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 8192) {
      return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
    }

    const limited = await checkRateLimit(req, 'search');
    if (limited) return limited;

    const [session, authErr] = await requireUser(req);
    if (authErr) return authErr;

    // Parse JSON safely (malformed JSON → 400, not 500)
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { animeSlug, episodeNumber, comment } = body as {
      animeSlug?: unknown;
      episodeNumber?: unknown;
      comment?: unknown;
    };

    // Type validation
    if (typeof animeSlug !== 'string' || typeof comment !== 'string') {
      return NextResponse.json({ error: 'Data tidak valid.' }, { status: 400 });
    }

    // Numeric type validation (avoid parseInt silently returning NaN)
    if (typeof episodeNumber !== 'number' || !Number.isFinite(episodeNumber)) {
      return NextResponse.json({ error: 'Episode number tidak valid.' }, { status: 400 });
    }
    if (episodeNumber < 1 || episodeNumber > 9999) {
      return NextResponse.json({ error: 'Episode number di luar rentang.' }, { status: 400 });
    }

    if (!animeSlug || !comment) {
      return NextResponse.json({ error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // Slug format validation (prevent path traversal / weird input)
    if (!/^[a-z0-9-]+$/.test(animeSlug) || animeSlug.length > 200) {
      return NextResponse.json({ error: 'Anime slug tidak valid.' }, { status: 400 });
    }

    if (comment.trim().length < 3) {
      return NextResponse.json({ error: 'Komen terlalu pendek.' }, { status: 400 });
    }
    if (comment.length > 1000) {
      return NextResponse.json({ error: 'Komen terlalu panjang (max 1000 char).' }, { status: 400 });
    }

    // Sanitize comment (basic XSS prevention — React escapes by default, but defense in depth)
    const sanitizedComment = comment
      .trim()
      .slice(0, 300)
      .replace(/\u0000/g, '') // null bytes
      .replace(/[\u200B-\u200D\uFEFF]/g, ''); // zero-width chars (could be used to bypass filters)

    const created = await db.serverComment.create({
      data: {
        animeSlug,
        episodeNumber,
        userId: session!.user.id,
        comment: sanitizedComment,
      },
      include: {
        user: { select: { name: true, avatar: true } },
      },
    });

    return NextResponse.json({ comment: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Gagal kirim komentar.' }, { status: 500 });
  }
}
