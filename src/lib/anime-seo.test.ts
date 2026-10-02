/**
 * Unit tests untuk builder SEO halaman anime (src/lib/anime-seo.ts).
 *
 * Fokus: canonical URL memakai route `/anime/<slug>` (bukan `/?anime=`),
 * gambar OG tidak pernah SVG, deskripsi dibatasi ~160 char, dan JSON-LD berisi
 * field yang dibutuhkan rich result Google.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildAnimeMetadata,
  buildAnimeCreativeWork,
  buildAnimeBreadcrumb,
  metaDescription,
  ogImageFor,
  type AnimeSeoInput,
} from './anime-seo';

function makeAnime(overrides: Partial<AnimeSeoInput> = {}): AnimeSeoInput {
  return {
    slug: 'shadow-blade',
    title: 'Shadow Blade',
    titleEn: 'Shadow Blade',
    titleJp: '影の刃',
    synopsis: 'Seorang pendekar pedang berburu iblis yang menghancurkan klannya.',
    poster: '/anime/poster-shadow-blade.svg',
    banner: '/anime/banner-shadow-blade.svg',
    score: 9.2,
    type: 'TV',
    status: 'Ongoing',
    studio: 'Ufotable',
    releasedYear: 2024,
    rating: 'R-17',
    genres: ['Action', 'Fantasy'],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSiteUrl integration', () => {
  it('memakai NEXT_PUBLIC_SITE_URL bila di-set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.example.com');
    vi.resetModules();
    const mod = await import('./anime-seo');
    const meta = mod.buildAnimeMetadata(makeAnime());
    expect(meta.alternates?.canonical).toBe('https://staging.example.com/anime/shadow-blade');
  });
});

describe('ogImageFor', () => {
  it('memakai og-image.png saat poster/banner SVG (scraper tidak dukung SVG)', () => {
    expect(ogImageFor(makeAnime())).toBe('https://anichin.id/og-image.png');
  });

  it('memakai poster raster (absolut) bila tersedia', () => {
    const url = ogImageFor(
      makeAnime({ poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/x.jpg', banner: null })
    );
    expect(url).toBe('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/x.jpg');
  });
});

describe('metaDescription', () => {
  it('memotong di batas kata dan menambahkan elipsis', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
    const long = Array.from({ length: 60 }, (_, i) => words[i % words.length]).join(' ');
    const out = metaDescription(makeAnime({ synopsis: long }));

    expect(out.length).toBeLessThanOrEqual(161);
    expect(out.endsWith('…')).toBe(true);

    // Kata terakhir harus utuh (tidak terpotong di tengah kata).
    const lastWord = out.replace('…', '').split(' ').pop() ?? '';
    expect(words).toContain(lastWord);
  });

  it('memakai fallback bila sinopsis kosong', () => {
    expect(metaDescription(makeAnime({ synopsis: '' }))).toContain('Shadow Blade');
  });
});

describe('buildAnimeMetadata', () => {
  it('canonical & OG url memakai route /anime/<slug>', () => {
    const meta = buildAnimeMetadata(makeAnime());
    expect(meta.alternates?.canonical).toBe('https://anichin.id/anime/shadow-blade');
    expect(meta.openGraph?.url).toBe('https://anichin.id/anime/shadow-blade');
    expect(meta.title).toContain('Shadow Blade');
  });
});

describe('buildAnimeCreativeWork', () => {
  it('memuat AggregateRating + review pengguna (bestRating 10)', () => {
    const jsonld = buildAnimeCreativeWork(
      makeAnime(),
      [
        {
          rating: 9,
          comment: 'Animasi luar biasa',
          createdAt: new Date('2026-01-02T00:00:00Z'),
          user: { name: 'Budi' },
        },
      ],
      7
    );
    expect(jsonld.url).toBe('https://anichin.id/anime/shadow-blade');
    expect(jsonld.aggregateRating.ratingCount).toBe(7);
    expect(jsonld.aggregateRating.bestRating).toBe(10);
    expect(jsonld.review).toHaveLength(1);
    expect(jsonld.review?.[0].author.name).toBe('Budi');
    expect(jsonld['@type']).toContain('TVSeries');
  });

  it('ratingCount minimal 1 dan review opsional', () => {
    const jsonld = buildAnimeCreativeWork(makeAnime(), [], 0);
    expect(jsonld.aggregateRating.ratingCount).toBe(1);
    expect(jsonld.review).toBeUndefined();
  });

  it('hanya memuat review milik anime ini dari data yang diberikan (dibatasi 10)', () => {
    const reviews = Array.from({ length: 25 }, (_, i) => ({
      rating: 8,
      comment: `review ${i}`,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      user: { name: `User ${i}` },
    }));
    const jsonld = buildAnimeCreativeWork(makeAnime(), reviews, 25);
    expect(jsonld.review).toHaveLength(10);
  });
});

describe('buildAnimeBreadcrumb', () => {
  it('memakai URL absolut dan route kanonik', () => {
    const bc = buildAnimeBreadcrumb({ slug: 'shadow-blade', title: 'Shadow Blade' });
    expect(bc.itemListElement).toHaveLength(3);
    expect(bc.itemListElement[2].item).toBe('https://anichin.id/anime/shadow-blade');
  });
});
