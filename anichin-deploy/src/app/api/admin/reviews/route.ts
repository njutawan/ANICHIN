import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const REVIEW_SELECT = {
  id: true,
  animeSlug: true,
  rating: true,
  comment: true,
  likes: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
    },
  },
} as const;

// GET /api/admin/reviews — list all reviews with pagination + anime filter
export async function GET(req: NextRequest) {
  try {
    const [, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const animeSlug = searchParams.get('animeSlug') || '';
    const q = (searchParams.get('q') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    const where: Record<string, unknown> = {};
    if (animeSlug) where.animeSlug = animeSlug;
    if (q) {
      where.comment = { contains: q, mode: 'insensitive' };
    }

    const [reviews, total] = await Promise.all([
      db.serverReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: REVIEW_SELECT,
      }),
      db.serverReview.count({ where }),
    ]);

    return addRateLimitHeaders(
      NextResponse.json({
        reviews,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }),
      'expensive'
    );
  } catch (err) {
    logger.error('admin/reviews GET failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/reviews',
    });
    return NextResponse.json(
      { error: 'Gagal memuat daftar ulasan.' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/reviews — moderate (delete) a review by id
export async function DELETE(req: NextRequest) {
  try {
    const [session, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get('id') || '';

    if (!idParam) {
      return NextResponse.json(
        { error: 'ID ulasan wajib diisi.' },
        { status: 400 }
      );
    }

    const reviewId = idParam.slice(0, 64);
    const existing = await db.serverReview.findUnique({
      where: { id: reviewId },
      select: { id: true, animeSlug: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Ulasan tidak ditemukan.' },
        { status: 404 }
      );
    }

    await db.serverReview.delete({ where: { id: reviewId } });

    logger.info('Review deleted by admin (moderation)', {
      reviewId,
      animeSlug: existing.animeSlug,
      authorId: existing.userId,
      adminId: session!.user.id,
      module: 'api/admin/reviews',
    });

    return NextResponse.json({ success: true, id: reviewId });
  } catch (err) {
    logger.error('admin/reviews DELETE failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/reviews',
    });
    return NextResponse.json(
      { error: 'Gagal menghapus ulasan.' },
      { status: 500 }
    );
  }
}
