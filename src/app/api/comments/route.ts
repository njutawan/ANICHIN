import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeUserText } from '@/lib/security';
import { getClientIp } from '@/lib/ip';
import { auditLog } from '@/lib/audit-log';
import {
  commentPayloadSchema,
  firstIssueMessage,
  episodeNumberSchema,
  listQuerySchema,
  COMMENT_MAX_LENGTH,
} from '@/lib/validation';

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

// GET comments for an episode (dengan paginasi cursor)
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const animeSlug = searchParams.get('animeSlug');
    const rawEpisode = searchParams.get('episodeNumber');

    if (!animeSlug || !rawEpisode) {
      // Backward compatible: tanpa parameter → daftar kosong (bukan error).
      return NextResponse.json({ comments: [], hasMore: false, nextCursor: null });
    }

    const episode = episodeNumberSchema.safeParse(Number(rawEpisode));
    const listParams = listQuerySchema.safeParse({
      limit: searchParams.get('limit') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
    });
    if (!episode.success || !listParams.success) {
      return NextResponse.json({ error: 'Parameter tidak valid.' }, { status: 400 });
    }

    const { limit, cursor } = listParams.data;

    // Ambil limit + 1 baris untuk mendeteksi apakah masih ada halaman berikutnya
    // tanpa query COUNT terpisah.
    const rows = await db.serverComment.findMany({
      where: { animeSlug, episodeNumber: episode.data },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { name: true, avatar: true } },
      },
    });

    const hasMore = rows.length > limit;
    const comments = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? comments[comments.length - 1]?.id ?? null : null;

    return addRateLimitHeaders(
      NextResponse.json({ comments, hasMore, nextCursor }, { headers: CACHE_HEADERS }),
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
    if (limited) {
      await auditLog.rateLimitHit(getClientIp(req), '/api/comments', 'search');
      return limited;
    }

    const [session, authErr] = await requireUser(req);
    if (authErr) return authErr;

    // Parse JSON safely (malformed JSON → 400, not 500)
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    // Validasi terpusat (Zod) — tipe, rentang, dan batas panjang yang SAMA
    // dengan nilai yang disimpan.
    const parsed = commentPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
    }

    const { animeSlug, episodeNumber, comment } = parsed.data;
    const sanitizedComment = sanitizeUserText(comment, COMMENT_MAX_LENGTH);

    // Sanitasi bisa memangkas input pendek menjadi kosong (mis. hanya tag HTML).
    if (sanitizedComment.length < 3) {
      return NextResponse.json({ error: 'Komentar terlalu pendek.' }, { status: 400 });
    }

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
