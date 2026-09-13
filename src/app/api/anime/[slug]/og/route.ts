import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/anime/[slug]/og
 *
 * Returns OpenGraph metadata for a specific anime.
 * Social media crawlers can fetch this to get dynamic OG tags per anime.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const anime = await db.anime.findUnique({
    where: { slug },
    select: {
      title: true,
      titleJp: true,
      synopsis: true,
      poster: true,
      banner: true,
      score: true,
      type: true,
      status: true,
      studio: true,
      genres: { include: { genre: { select: { name: true } } } },
    },
  });

  if (!anime) {
    return NextResponse.json({ error: 'Anime not found' }, { status: 404 });
  }

  const SITE_URL = process.env.NEXTAUTH_URL || 'https://anichin.id';
  const genreNames = anime.genres.map(g => g.genre.name).slice(0, 3).join(', ');
  const image = anime.banner || anime.poster;
  const description = anime.synopsis.slice(0, 160) + (anime.synopsis.length > 160 ? '…' : '');

  return NextResponse.json({
    title: `${anime.title} — Nonton Sub Indo HD 1080p · AniChin`,
    description,
    image,
    url: `${SITE_URL}/?anime=${slug}`,
    type: 'video.other',
    siteName: 'AniChin',
    locale: 'id_ID',
    twitterCard: 'summary_large_image',
    twitterSite: '@anichin',
    twitterCreator: '@anichin',
    anime: {
      title: anime.title,
      titleJp: anime.titleJp,
      score: anime.score,
      type: anime.type,
      status: anime.status,
      studio: anime.studio,
      genres: genreNames,
    },
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
