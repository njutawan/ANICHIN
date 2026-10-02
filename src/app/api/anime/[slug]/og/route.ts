import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/ip';
import { auditLog } from '@/lib/audit-log';
import { buildAnimeMetadata, metaDescription, ogImageFor } from '@/lib/anime-seo';
import { animeUrl } from '@/lib/site';

/**
 * GET /api/anime/[slug]/og
 *
 * Metadata OpenGraph per anime (JSON) — dipakai untuk integrasi eksternal.
 *
 * Catatan: halaman kanonik `/anime/[slug]` sudah mengirim OG/Twitter tag yang
 * sama lewat Next Metadata API (server-rendered), jadi scraper social media
 * (Facebook/WhatsApp/Twitter) membacanya langsung dari HTML.
 */

const SLUG_RE = /^[a-z0-9-]+$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = await checkRateLimit(req, 'read');
    if (limited) {
      await auditLog.rateLimitHit(getClientIp(req), '/api/anime/[slug]/og', 'read');
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
        poster: true, banner: true, score: true, type: true, status: true,
        studio: true, releasedYear: true, rating: true,
        genres: { include: { genre: { select: { name: true } } } },
      },
    });

    if (!anime) return NextResponse.json({ error: 'Anime not found' }, { status: 404 });

    const seoInput = { ...anime, genres: anime.genres.map((g) => g.genre.name) };
    const metadata = buildAnimeMetadata(seoInput);

    return addRateLimitHeaders(
      NextResponse.json(
        {
          title: metadata.title,
          description: metaDescription(seoInput),
          image: ogImageFor(seoInput),
          url: animeUrl(anime.slug),
          type: 'video.other',
          siteName: 'AniChin',
          locale: 'id_ID',
          twitterCard: 'summary_large_image',
          twitterSite: '@anichin',
          twitterCreator: '@anichin',
          anime: {
            title: anime.title,
            titleJp: anime.titleJp,
            titleEn: anime.titleEn,
            score: anime.score,
            type: anime.type,
            status: anime.status,
            studio: anime.studio,
            releasedYear: anime.releasedYear,
            genres: seoInput.genres.slice(0, 3).join(', '),
          },
        },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
      ),
      'read'
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
