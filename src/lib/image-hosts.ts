/**
 * Whitelist host gambar remote untuk `next/image` (P1-5).
 *
 * Sebelumnya `next.config.ts` memakai `hostname: '**'`, artinya siapa pun bisa
 * memakai `/_next/image?url=https://situs-lain/…` sebagai optimizer/proxy
 * gratis (biaya CPU kita) sekaligus vektor pemindaian jaringan internal.
 *
 * Modul ini menyediakan:
 * - daftar host default (hanya CDN gambar anime yang benar-benar relevan);
 * - cara menambah host CDN sendiri lewat env tanpa mengubah kode;
 * - helper yang dipakai sisi klien supaya gambar dari host **di luar** daftar
 *   tetap tampil (langsung dari sumbernya, tanpa lewat optimizer) alih-alih
 *   gagal dengan HTTP 400.
 *
 * Env:
 *   NEXT_PUBLIC_IMAGE_HOSTS="cdn.example.com, *.mycdn.net, https://img.other.id/path"
 *
 * Dipakai `NEXT_PUBLIC_` karena nilainya dibutuhkan dua tempat sekaligus:
 * `next.config.ts` (build time) dan komponen klien yang menentukan perlu
 * tidaknya melewati optimizer.
 */

export interface ImageRemotePattern {
  protocol: 'https';
  hostname: string;
  port?: string;
  pathname?: string;
}

/**
 * Host default — CDN yang memang menyajikan gambar anime:
 * - `s4.anilist.co` — poster/banner AniList (sudah di-preconnect di layout);
 * - `cdn.myanimelist.net` — gambar MyAnimeList (Jikan API);
 * - `image.tmdb.org` — poster/backdrop TMDB.
 */
export const DEFAULT_IMAGE_HOSTS = [
  's4.anilist.co',
  'cdn.myanimelist.net',
  'image.tmdb.org',
] as const;

/** True bila `src` adalah URL absolut (bukan path lokal/data URI). */
export function isRemoteImageSrc(src: string | null | undefined): boolean {
  return typeof src === 'string' && /^https?:\/\//i.test(src);
}

/**
 * Pisahkan daftar host dari env. Menerima:
 * - daftar dipisah koma atau spasi;
 * - URL utuh (`https://img.example.com/x.jpg` → `img.example.com`);
 * - wildcard subdomain (`*.example.com`);
 * - port eksplisit (`localhost:9000`).
 */
export function parseImageHosts(raw: string | null | undefined): ImageRemotePattern[] {
  if (!raw) return [];

  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      // Buang skema + path bila yang ditulis adalah URL utuh.
      let value = entry.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
      value = value.split('/')[0];

      // Pisahkan port (kecuali IPv6 yang tidak kita dukung di sini).
      const [hostname, port] = value.split(':');
      const normalized = hostname.toLowerCase().replace(/\.$/, '');
      if (!normalized) return null;

      return port ? { protocol: 'https' as const, hostname: normalized, port } : { protocol: 'https' as const, hostname: normalized };
    })
    .filter((p): p is ImageRemotePattern => p !== null);
}

/**
 * Daftar pola final untuk `next.config.ts`: host default + tambahan dari env,
 * tanpa duplikat (host yang sama tidak ditulis dua kali).
 */
export function resolveImageRemotePatterns(raw?: string | null): ImageRemotePattern[] {
  const defaults: ImageRemotePattern[] = DEFAULT_IMAGE_HOSTS.map((hostname) => ({
    protocol: 'https',
    hostname,
  }));
  const all: ImageRemotePattern[] = [...defaults, ...parseImageHosts(raw)];

  const seen = new Set<string>();
  return all.filter((pattern) => {
    const key = `${pattern.hostname}:${pattern.port ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Cocokkan hostname dengan pola.
 *
 * Sengaja dibuat **sama persis** dengan perilaku `images.remotePatterns` milik
 * Next (diverifikasi lewat `/_next/image`): `*.example.com` hanya cocok dengan
 * subdomain, sedangkan apex `example.com` harus didaftarkan sendiri. Kalau
 * helper ini lebih longgar dari Next, gambar yang "dianggap boleh" di klien
 * akan ditolak optimizer (HTTP 400) dan malah jatuh ke fallback.
 */
export function hostMatchesPattern(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const pat = pattern.toLowerCase();
  if (pat.startsWith('*.')) {
    const base = pat.slice(2);
    return base.length > 0 && host.endsWith(`.${base}`);
  }
  return host === pat;
}

/**
 * Apakah `src` boleh dilewatkan image optimizer? Dipakai di klien.
 *
 * Gambar lokal/data-URI → boleh (Next menanganinya sendiri; SVG & data-URI
 * tetap dikirim `unoptimized` oleh `AnimeImage`).
 * Gambar remote → hanya bila hostnya ada di daftar; host lain tetap
 * ditampilkan tetapi langsung dari sumbernya, jadi kita tidak pernah
 * mengunduhnya lewat server.
 */
export function isAllowedRemoteImage(
  src: string | null | undefined,
  patterns: ImageRemotePattern[] = resolveImageRemotePatterns(process.env.NEXT_PUBLIC_IMAGE_HOSTS)
): boolean {
  if (!isRemoteImageSrc(src)) return true;

  let hostname: string;
  try {
    hostname = new URL(src as string).hostname;
  } catch {
    return false;
  }

  return patterns.some((p) => hostMatchesPattern(hostname, p.hostname));
}

/**
 * Kebalikan dari helper di atas — dipakai komponen untuk menentukan prop
 * `unoptimized`. True bila gambar remote berasal dari host di luar daftar
 * (atau URL-nya tidak valid).
 */
export function needsUnoptimized(
  src: string | null | undefined,
  patterns?: ImageRemotePattern[]
): boolean {
  if (!src) return false;
  return !isAllowedRemoteImage(src, patterns);
}
