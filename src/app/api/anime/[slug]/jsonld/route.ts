import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/anime/[slug]/jsonld
 *
 * Returns JSON-LD structured data for a specific anime.
 * This is the data Google reads for rich snippets (rating stars, reviews).
 *
 * Includes:
 * - CreativeWork schema (anime metadata)
 * - AggregateRating (from base score + user reviews)
 * - Individual Review objects (up to 5 most recent)
 * - BreadcrumbList (navigation context)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const anime = await db.anime.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      titleEn: true,
      titleJp: true,
      synopsis: true,
      poster: true,
      banner: true,
      type: true,
      status: true,
      studio: true,
      score: true,
      views: true,
      releasedYear: true,
      season: true,
      genres: { include: { genre: { select: { name: true } } } },
    },
  });

  if (!anime) {
    return NextResponse.json({ error: 'Anime not found' }, { status: 404 });
  }

  // Count reviews separately (Anime model doesn't have reviews relation in schema)
  const reviewCount = await db.serverReview.count({ where: { animeSlug: slug } });

  const reviews = await db.serverReview.findMany({
    where: { animeSlug: slug },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { user: { select: { name: true } } },
  });

  const SITE_URL = process.env.NEXTAUTH_URL || 'https://anichin.id';

  const reviewObjects = reviews.map(r => ({
    "@type": "Review",
    "author": { "@type": "Person", "name": r.user.name || 'Anonim' },
    "datePublished": r.createdAt.toISOString().split('T')[0],
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": r.rating,
      "bestRating": 10,
      "worstRating": 1,
    },
    "reviewBody": r.comment.slice(0, 300),
  }));

  const aggregateRating = {
    "@type": "AggregateRating",
    "ratingValue": anime.score,
    "bestRating": 10,
    "worstRating": 0,
    "ratingCount": reviewCount > 0 ? reviewCount : 1,
  };

  const creativeWork = {
    "@context": "https://schema.org",
    "@type": ["TVSeries", "CreativeWork"],
    "name": anime.title,
    "alternateName": [anime.titleEn, anime.titleJp].filter(Boolean),
    "url": `${SITE_URL}/?anime=${anime.slug}`,
    "image": anime.poster,
    "description": anime.synopsis,
    "genre": anime.genres.map(g => g.genre.name),
    ...(anime.studio ? { "creator": { "@type": "Organization", "name": anime.studio } } : {}),
    ...(anime.releasedYear ? { "datePublished": String(anime.releasedYear) } : {}),
    "aggregateRating": aggregateRating,
    ...(reviewObjects.length > 0 ? { "review": reviewObjects } : {}),
    // VideoObject for episodes (Google video rich results)
    "containsSeason": {
      "@type": "CreativeWorkSeason",
      "name": `${anime.title} - Season 1`,
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Beranda", "item": SITE_URL },
      { "@type": "ListItem", "position": 2, "name": "Anime List", "item": `${SITE_URL}/#list` },
      { "@type": "ListItem", "position": 3, "name": anime.title, "item": `${SITE_URL}/?anime=${anime.slug}` },
    ],
  };

  return NextResponse.json({ creativeWork, breadcrumb }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
