/**
 * Single source of truth for the public site URL.
 *
 * Sebelumnya `https://anichin.id` di-hardcode di 16+ file, sehingga deploy di
 * domain lain (staging, preview, domain kustom) menghasilkan canonical/OG/
 * sitemap yang menunjuk ke domain yang salah.
 *
 * Urutan resolusi:
 *   1. NEXT_PUBLIC_SITE_URL — URL kanonik deployment. Prefix NEXT_PUBLIC_ agar
 *      nilainya ikut ter-inline ke bundle browser (client components butuh ini;
 *      NEXTAUTH_URL tidak tersedia di browser).
 *   2. NEXTAUTH_URL — fallback server-side untuk deployment Docker/Caddy.
 *   3. DEFAULT_SITE_URL — domain produksi saat ini.
 *
 * Semua nilai dinormalisasi tanpa trailing slash.
 */

export const DEFAULT_SITE_URL = 'https://anichin.id';

function normalize(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : DEFAULT_SITE_URL;
}

/**
 * Resolve the site URL at call time (test-friendly: bisa di-stub via env).
 */
export function getSiteUrl(): string {
  return normalize(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXTAUTH_URL ||
      DEFAULT_SITE_URL
  );
}

/**
 * Resolved once at module load. Aman untuk client components: kalau
 * NEXT_PUBLIC_SITE_URL di-set saat build, Next.js meng-inline nilainya.
 */
export const SITE_URL = getSiteUrl();

/** Build an absolute URL for a root-relative path. */
export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath === '/' ? '' : normalizedPath}`;
}

/** Canonical (SEO-friendly) route for an anime detail page. */
export function animePath(slug: string): string {
  return `/anime/${slug}`;
}

/** Absolute canonical URL for an anime detail page. */
export function animeUrl(slug: string): string {
  return `${SITE_URL}${animePath(slug)}`;
}
