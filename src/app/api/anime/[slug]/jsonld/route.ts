import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/ip';
import { auditLog } from '@/lib/audit-log';
import { buildAnimeCreativeWork, buildAnimeBreadcrumb } from '@/lib/anime-seo';

/**
 * GET /api/anime/[slug]/jsonld
 *
 * JSON-LD untuk rich snippet Google (CreativeWork + AggregateRating + Review).
 *
 * Catatan: halaman kanonik `/anime/[slug]` kini merender JSON-LD ini
 * server-side (lihat src/app/anime/[slug]/page.tsx), jadi endpoint ini
 * disediakan untuk konsumen eksternal/integrasi — bukan lagi jalur utama
 * karena metadata yang disuntik lewat JS tidak dibaca crawler.
 */

const SLUG_RE = /^[a-z0-9-]+$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = await checkRateLimit(req, 'read');
    if (limited) {
      await auditLog.rateLimitHit(getClientIp(req), '/api/anime/[slug]/jsonld', 'read');
      return limited;
    }

    const { slug } = await params;
    if (!SLUG_RE.test(slug) || slug.length > 200) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const anime = await db.anime.findUnique({
      where: { slug },
      select: {
        slug: true, title: true, titleEn: true, titleJp: true, synopsis: true,
        poster: true, banner: true, type: true, status: true, studio: true,
        score: true, releasedYear: true, rating: true,
        genres: { include: { genre: { select: { name: true } } } },
      },
    });

    if (!anime) return NextResponse.json({ error: 'Anime not found' }, { status: 404 });

    const [reviewCount, reviews] = await Promise.all([
      db.serverReview.count({ where: { animeSlug: slug } }),
      db.serverReview.findMany({
        where: { animeSlug: slug },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { user: { select: { name: true } } },
      }),
    ]);

    const creativeWork = buildAnimeCreativeWork(
      { ...anime, genres: anime.genres.map((g) => g.genre.name) },
      reviews,
      reviewCount
    );

    return addRateLimitHeaders(
      NextResponse.json(
        { creativeWork, breadcrumb: buildAnimeBreadcrumb(anime) },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
      ),
      'read'
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
