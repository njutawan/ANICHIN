import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeUserText } from '@/lib/security';
import { getClientIp } from '@/lib/ip';
import { auditLog } from '@/lib/audit-log';
import {
  reviewPayloadSchema,
  firstIssueMessage,
  listQuerySchema,
  REVIEW_MAX_LENGTH,
} from '@/lib/validation';
import { isRecordNotFound } from '@/lib/prisma-errors';

/**
 * Ulasan = konten buatan pengguna: jangan di-cache CDN. Sama seperti komentar,
 * `s-maxage=60` membuat ulasan yang baru dikirim tidak muncul (bahkan bagi
 * penulisnya) sampai cache CDN kedaluwarsa. Lihat `api/comments/route.ts`.
 */
const NO_STORE = { 'Cache-Control': 'no-store' };

// GET reviews for an anime (dengan paginasi cursor)
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 'read');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const animeSlug = searchParams.get('animeSlug');

    if (!animeSlug) {
      return NextResponse.json({ reviews: [], hasMore: false, nextCursor: null });
    }

    if (animeSlug.length > 200 || !/^[a-z0-9-]+$/.test(animeSlug)) {
      return NextResponse.json({ error: 'Slug anime tidak valid.' }, { status: 400 });
    }

    const listParams = listQuerySchema.safeParse({
      limit: searchParams.get('limit') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
    });
    if (!listParams.success) {
      return NextResponse.json({ error: 'Parameter tidak valid.' }, { status: 400 });
    }

    const { limit, cursor } = listParams.data;

    // limit + 1 untuk mendeteksi halaman berikutnya.
    // `orderBy` majemuk (createdAt + id) = urutan stabil antar halaman; dengan
    // kunci tunggal, ulasan yang dibuat pada milidetik yang sama bisa terlewat
    // atau tampil dua kali saat membaca halaman berikutnya.
    let rows;
    try {
      rows = await db.serverReview.findMany({
        where: { animeSlug },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          user: { select: { name: true, avatar: true } },
        },
      });
    } catch (err) {
      // Cursor menunjuk ulasan yang sudah dihapus → 400 (bukan 500).
      if (cursor && isRecordNotFound(err)) {
        return NextResponse.json(
          { error: 'Cursor sudah tidak valid. Muat ulang daftar ulasan.' },
          { status: 400 }
        );
      }
      throw err;
    }

    const hasMore = rows.length > limit;
    const reviews = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? reviews[reviews.length - 1]?.id ?? null : null;

    return addRateLimitHeaders(
      NextResponse.json({ reviews, hasMore, nextCursor }, { headers: NO_STORE }),
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
    if (limited) {
      await auditLog.rateLimitHit(getClientIp(req), '/api/reviews', 'search');
      return limited;
    }

    const [session, authErr] = await requireUser(req);
    if (authErr) return authErr;

    // Parse JSON safely
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    // Validasi terpusat (Zod). Menolak rating non-number/desimal di luar 1-10
    // dan panjang ulasan di luar batas yang benar-benar disimpan.
    const parsed = reviewPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
    }

    const { animeSlug, rating, comment } = parsed.data;
    const sanitizedComment = sanitizeUserText(comment, REVIEW_MAX_LENGTH);

    if (sanitizedComment.length < 5) {
      return NextResponse.json({ error: 'Ulasan terlalu pendek.' }, { status: 400 });
    }

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
