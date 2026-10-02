import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/comments/[id] — hapus komentar.
 *
 * Sebelumnya tombol "Hapus" di modal komentar hanya menghapus entri
 * localStorage: komentar milik orang lain tetap tampil bagi semua pengguna.
 * Sekarang penghapusan benar-benar terjadi di server, dan hanya boleh oleh
 * penulisnya sendiri atau admin.
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
      return NextResponse.json({ error: 'ID komentar tidak valid.' }, { status: 400 });
    }

    const comment = await db.serverComment.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Komentar tidak ditemukan.' }, { status: 404 });
    }

    const isOwner = comment.userId === session!.user.id;
    const isAdmin = session!.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Kamu hanya bisa menghapus komentar sendiri.' },
        { status: 403 }
      );
    }

    await db.serverComment.delete({ where: { id } });

    return addRateLimitHeaders(NextResponse.json({ ok: true, id }), 'search');
  } catch {
    return NextResponse.json({ error: 'Gagal menghapus komentar.' }, { status: 500 });
  }
}
