import { db } from '@/lib/db';

export const dynamic = 'force-static';
export const revalidate = 3600;

export default async function sitemap() {
  const SITE_URL = 'https://anichin.id';
  const now = new Date();

  // Supported locales
  const locales = ['', '/en', '/ja'];

  // Static pages per locale
  const sections = ['', '#list', '#schedule', '#collections'];
  const priorities = [1, 0.9, 0.8, 0.7];
  const frequencies = ['hourly', 'daily', 'daily', 'weekly'] as const;

  const staticEntries = locales.flatMap((locale) =>
    sections.map((section, i) => ({
      url: `${SITE_URL}${locale}${section ? `/${section}` : ''}`,
      lastModified: now,
      changeFrequency: frequencies[i],
      priority: priorities[i],
    }))
  );

  // Dynamic anime pages per locale
  const animes = await db.anime.findMany({
    select: { slug: true, title: true, updatedAt: true },
    take: 100,
  });

  const animeEntries = locales.flatMap((locale) =>
    animes.map((a) => ({
      url: `${SITE_URL}${locale}/?anime=${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  );

  return [...staticEntries, ...animeEntries];
}
