import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { SITE_URL, animePath } from '@/lib/site';

// Sitemap queries PostgreSQL (`db.anime.findMany`), so it must NOT be
// prerendered at build time (the Docker/CI image build has no database).
// Generated on demand (crawlers hit it rarely; the CDN/proxy caches it).
export const dynamic = 'force-dynamic';

/**
 * Home routes per locale.
 *
 * Catatan SEO: entri fragmen seperti `/#list` atau `/#schedule` DIHAPUS —
 * Google mengabaikan fragment di sitemap sehingga semuanya hanya menjadi
 * duplikat dari halaman utama.
 */
// `/ja` dihapus (P0-7): kontennya bukan Jepang, hanya duplikat homepage.
// Redirect 301-nya ada di next.config.ts.
const LOCALES = ['', '/en'] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const homeEntries: MetadataRoute.Sitemap = LOCALES.map((locale, i) => ({
    url: locale === '' ? `${SITE_URL}/` : `${SITE_URL}${locale}`,
    lastModified: now,
    changeFrequency: 'hourly',
    priority: i === 0 ? 1 : 0.8,
  }));

  // Anime detail pages — pakai route kanonik `/anime/[slug]`.
  // Sebelumnya sitemap memakai `/?anime=slug` yang canonical-nya "/" sehingga
  // tidak akan pernah diindeks Google.
  const animes = await db.anime.findMany({
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  const animeEntries: MetadataRoute.Sitemap = animes.map((a) => ({
    url: `${SITE_URL}${animePath(a.slug)}`,
    lastModified: a.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...homeEntries, ...animeEntries];
}
