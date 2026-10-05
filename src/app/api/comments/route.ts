import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeUserText } from '@/lib/security';
import { getClientIp } from '@/lib/ip';
import { auditLog } from '@/lib/audit-log';
import {
  animeSlugSchema,
  commentPayloadSchema,
  firstIssueMessage,
  episodeNumberSchema,
  listQuerySchema,
  COMMENT_MAX_LENGTH,
} from '@/lib/validation';
import { isRecordNotFound } from '@/lib/prisma-errors';

/**
 * Daftar komentar = konten buatan pengguna, jadi **tidak boleh di-cache**.
 *
 * Sebelumnya `public, s-maxage=60, stale-while-revalidate=300`: di deployment
 * ber-CDN (Vercel) komentar yang baru dikirim penulisnya sendiri bisa tidak
 * muncul sampai ~1 menit, karena refetch setelah POST mengambil salinan CDN
 * dengan URL yang sama. Permintaan daftar komentar kecil dan jarang, jadi
 * melepas cache CDN adalah trade-off yang benar.
 */
const NO_STORE = { 'Cache-Control': 'no-store' };

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

    // Slug divalidasi dengan skema yang sama seperti POST (dan GET /api/reviews)
    // supaya bentuk input yang diterima konsisten — sebelumnya slug apa pun
    // diteruskan mentah ke query.
    const episode = episodeNumberSchema.safeParse(Number(rawEpisode));
    const slug = animeSlugSchema.safeParse(animeSlug);
    const listParams = listQuerySchema.safeParse({
      limit: searchParams.get('limit') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
    });
    if (!episode.success || !slug.success || !listParams.success) {
      return NextResponse.json({ error: 'Parameter tidak valid.' }, { status: 400 });
    }

    const { limit, cursor } = listParams.data;

    // Ambil limit + 1 baris untuk mendeteksi apakah masih ada halaman berikutnya
    // tanpa query COUNT terpisah.
    //
    // `orderBy` memakai kunci majemuk (createdAt + id): beberapa komentar bisa
    // dibuat pada milidetik yang sama (seed/impor), dan tanpa tie-breaker urutan
    // antar halaman tidak stabil → baris bisa terlewat atau tampil dua kali.
    let rows;
    try {
      rows = await db.serverComment.findMany({
        where: { animeSlug: slug.data, episodeNumber: episode.data },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          user: { select: { name: true, avatar: true } },
        },
      });
    } catch (err) {
      // Cursor menunjuk komentar yang sudah tidak ada (mis. dihapus penulisnya
      // saat pembaca membuka halaman berikutnya) — itu request tidak valid,
      // bukan kegagalan server. Sebelumnya berakhir sebagai 500.
      if (cursor && isRecordNotFound(err)) {
        return NextResponse.json(
          { error: 'Cursor sudah tidak valid. Muat ulang daftar komentar.' },
          { status: 400 }
        );
      }
      throw err;
    }

    const hasMore = rows.length > limit;
    const comments = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? comments[comments.length - 1]?.id ?? null : null;

    return addRateLimitHeaders(
      NextResponse.json({ comments, hasMore, nextCursor }, { headers: NO_STORE }),
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
