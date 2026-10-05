import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { isRecordNotFound } from '@/lib/prisma-errors';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/reviews/[id] — hapus ulasan.
 *
 * Sebelumnya UI (`reviews-tab.tsx`) memanggil `DELETE /api/reviews` dengan body
 * `{ reviewId }`, tetapi handler itu **tidak pernah ada**: tombol "Hapus" selalu
 * gagal (405) dan pesan error pun tidak tampil karena handler lama hanya
 * menangani `catch` untuk kegagalan jaringan. Sekarang penghapusan benar-benar
 * terjadi di server, dan hanya boleh oleh penulisnya sendiri atau admin —
 * memakai aturan yang sama dengan `DELETE /api/comments/[id]`.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await checkRateLimit(req, 'search');
    if (limited) return limited;

    const [session, authErr] = await requireUser(req);
    if (authErr) return authErr;

    const { id } = await params;
    if (!id || id.length > 64) {
      return NextResponse.json({ error: 'ID ulasan tidak valid.' }, { status: 400 });
    }

    const review = await db.serverReview.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!review) {
      return NextResponse.json({ error: 'Ulasan tidak ditemukan.' }, { status: 404 });
    }

    const isOwner = review.userId === session!.user.id;
    const isAdmin = session!.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Kamu hanya bisa menghapus ulasan sendiri.' },
        { status: 403 }
      );
    }

    try {
      await db.serverReview.delete({ where: { id } });
    } catch (err) {
      // Balapan: perangkat lain sudah menghapus baris ini lebih dulu.
      if (isRecordNotFound(err)) {
        return NextResponse.json({ error: 'Ulasan sudah dihapus.' }, { status: 404 });
      }
      throw err;
    }

    return addRateLimitHeaders(NextResponse.json({ ok: true, id }), 'search');
  } catch {
    return NextResponse.json({ error: 'Gagal menghapus ulasan.' }, { status: 500 });
  }
}
