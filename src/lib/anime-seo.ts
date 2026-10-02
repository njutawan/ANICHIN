/**
 * Anime SEO builders — dipakai bersama oleh halaman server-rendered
 * `/anime/[slug]` dan endpoint /api/anime/[slug]/(jsonld|og).
 *
 * Sebelumnya JSON-LD & OG hanya dibuat di route API dan disuntikkan ke <head>
 * lewat JavaScript ketika modal detail dibuka. Scraper (Google, Facebook,
 * WhatsApp, Twitter) tidak menjalankan JS, jadi metadata itu tidak pernah
 * terbaca. Sekarang keduanya dirender server-side di route kanonik.
 */
import type { Metadata } from 'next';
import { SITE_URL, animeUrl } from '@/lib/site';

export interface AnimeSeoInput {
  slug: string;
  title: string;
  titleEn?: string | null;
  titleJp?: string | null;
  synopsis: string;
  poster: string;
  banner?: string | null;
  score: number;
  type: string;
  status: string;
  studio?: string | null;
  releasedYear?: number | null;
  rating?: string | null;
  genres?: string[];
}

export interface ReviewSeoInput {
  rating: number;
  comment: string;
  createdAt: Date | string;
  user: { name: string | null } | null;
}

const RASTER_RE = /\.(png|jpe?g|webp|avif)(\?.*)?$/i;

/**
 * Gambar untuk OG/Twitter. Poster katalog berupa SVG dan SVG tidak didukung
 * scraper social media, jadi fallback ke og-image.png statis.
 */
export function ogImageFor(anime: AnimeSeoInput): string {
  const candidate = anime.banner || anime.poster;
  if (candidate && RASTER_RE.test(candidate)) {
    return /^https?:\/\//i.test(candidate) ? candidate : `${SITE_URL}${candidate}`;
  }
  return `${SITE_URL}/og-image.png`;
}

/** Deskripsi meta (maks ~160 char, memotong di batas kata). */
export function metaDescription(anime: AnimeSeoInput): string {
  const base = anime.synopsis?.trim() || `Nonton ${anime.title} sub Indo kualitas HD di AniChin.`;
  if (base.length <= 160) return base;
  const cut = base.slice(0, 160);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Metadata Next.js (title, canonical, OG, Twitter) untuk halaman anime. */
export function buildAnimeMetadata(anime: AnimeSeoInput): Metadata {
  const canonical = animeUrl(anime.slug);
  const title = `${anime.title} Sub Indo — Nonton & Download HD 1080p`;
  const description = metaDescription(anime);
  const image = ogImageFor(anime);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'AniChin',
      type: 'video.other',
      locale: 'id_ID',
      images: [{ url: image, width: 1200, height: 630, alt: `${anime.title} — AniChin` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
      creator: '@anichin',
      site: '@anichin',
    },
  };
}

/** JSON-LD CreativeWork/TVSeries + review pengguna. */
export function buildAnimeCreativeWork(
  anime: AnimeSeoInput,
  reviews: ReviewSeoInput[] = [],
  reviewCount = 0
) {
  const canonical = animeUrl(anime.slug);

  const reviewObjects = reviews.slice(0, 10).map((r) => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: r.user?.name || 'Anonim' },
    datePublished: new Date(r.createdAt).toISOString().split('T')[0],
    reviewRating: {
      '@type': 'Rating',
      ratingValue: r.rating,
      bestRating: 10,
      worstRating: 1,
    },
    reviewBody: r.comment.slice(0, 300),
  }));

  return {
    '@context': 'https://schema.org',
    '@type': ['TVSeries', 'CreativeWork'],
    name: anime.title,
    alternateName: [anime.titleEn, anime.titleJp].filter(Boolean),
    url: canonical,
    image: /^https?:\/\//i.test(anime.poster) ? anime.poster : `${SITE_URL}${anime.poster}`,
    description: anime.synopsis,
    genre: anime.genres ?? [],
    inLanguage: 'id-ID',
    ...(anime.studio ? { creator: { '@type': 'Organization', name: anime.studio } } : {}),
    ...(anime.releasedYear ? { datePublished: String(anime.releasedYear) } : {}),
    ...(anime.type ? { additionalType: `Anime ${anime.type}` } : {}),
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: anime.score,
      bestRating: 10,
      worstRating: 0,
      ratingCount: reviewCount > 0 ? reviewCount : 1,
    },
    ...(reviewObjects.length > 0 ? { review: reviewObjects } : {}),
  };
}

/** JSON-LD BreadcrumbList untuk halaman anime. */
export function buildAnimeBreadcrumb(anime: Pick<AnimeSeoInput, 'slug' | 'title'>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Anime List', item: `${SITE_URL}/#list` },
      { '@type': 'ListItem', position: 3, name: anime.title, item: animeUrl(anime.slug) },
    ],
  };
}
