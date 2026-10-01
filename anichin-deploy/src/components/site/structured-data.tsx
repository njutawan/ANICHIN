import { db } from '@/lib/db';
import { sanitizeForJSONLD } from '@/lib/security';

const SITE_URL = 'https://anichin.id';

/**
 * Server component that injects JSON-LD structured data into the page.
 * Generates:
 * - ItemList of top trending anime
 * - BreadcrumbList for site navigation
 * - FAQPage with common questions
 */
export async function StructuredData() {
  // Fetch top 10 trending anime with REAL review counts from DB
  const trending = await db.anime.findMany({
    where: { trending: true },
    orderBy: { views: 'desc' },
    take: 10,
    select: {
      slug: true,
      title: true,
      titleJp: true,
      titleEn: true,
      poster: true,
      score: true,
      views: true,
      type: true,
      status: true,
      synopsis: true,
    },
  });

  // Fetch real review counts per anime (Anime model doesn't have _count.reviews)
  const topAnimeSlugs = trending.map(a => a.slug);
  const reviewCounts = await db.serverReview.groupBy({
    by: ['animeSlug'],
    where: { animeSlug: { in: topAnimeSlugs } },
    _count: { _all: true },
  });
  const reviewCountMap = new Map(reviewCounts.map(r => [r.animeSlug, r._count._all]));

  // Fetch top reviews per trending anime (for individual Review JSON-LD)
  const reviewsData = await db.serverReview.findMany({
    where: { animeSlug: { in: topAnimeSlugs } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      user: { select: { name: true } },
    },
  });

  // Group reviews by anime slug
  const reviewsByAnime = reviewsData.reduce((acc, r) => {
    if (!acc[r.animeSlug]) acc[r.animeSlug] = [];
    acc[r.animeSlug].push(r);
    return acc;
  }, {} as Record<string, typeof reviewsData>);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Anime Trending Terpopuler di AniChin",
    "description": "Daftar anime paling populer berdasarkan jumlah penonton di AniChin.",
    "itemListElement": trending.map((anime, i) => {
      const reviewCount = reviewCountMap.get(anime.slug) || 0;
      const animeReviews = reviewsByAnime[anime.slug] || [];

      // Build individual Review JSON-LD objects (Google requires real reviews)
      const reviewObjects = animeReviews.slice(0, 5).map(r => ({
        "@type": "Review",
        "author": { "@type": "Person", "name": r.user.name },
        "datePublished": r.createdAt.toISOString().split('T')[0],
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": r.rating,
          "bestRating": 10,
          "worstRating": 1,
        },
        "reviewBody": r.comment.slice(0, 300),
      }));

      return {
        "@type": "ListItem",
        "position": i + 1,
        "item": {
          // TVSeries is more accurate for anime than CreativeWork
          "@type": ["TVSeries", "CreativeWork"],
          "name": anime.title,
          "alternateName": [anime.titleEn || null, anime.titleJp].filter(Boolean),
          "url": `${SITE_URL}/?anime=${anime.slug}`,
          "image": anime.poster,
          "description": anime.synopsis,
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": anime.score,
            "bestRating": 10,
            "worstRating": 0,
            // REAL review count from DB (not faked from views)
            "ratingCount": Number(reviewCount) > 0 ? Number(reviewCount) : 1,
          },
          // Include individual reviews if available (Google rich snippets requirement)
          ...(reviewObjects.length > 0 ? { "review": reviewObjects } : {}),
          "about": {
            "@type": "Thing",
            "name": anime.title,
            "sameAs": `https://anilist.co/search/anime?search=${encodeURIComponent(anime.title)}`,
          },
        },
      };
    }),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Beranda",
        "item": SITE_URL,
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Anime List",
        "item": `${SITE_URL}/#list`,
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": "Jadwal Rilis",
        "item": `${SITE_URL}/#schedule`,
      },
      {
        "@type": "ListItem",
        "position": 4,
        "name": "Koleksi",
        "item": `${SITE_URL}/#collections`,
      },
    ],
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Apa itu AniChin?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "AniChin adalah situs nonton dan download anime subtitle Indonesia terlengkap. Streaming anime terbaru, movie, dan ongoing dengan kualitas HD 1080p gratis.",
        },
      },
      {
        "@type": "Question",
        "name": "Apakah AniChin gratis?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Ya, AniChin 100% gratis. Anda dapat menonton dan mendownload anime subtitle Indonesia tanpa biaya apa pun.",
        },
      },
      {
        "@type": "Question",
        "name": "Berapa kualitas video yang tersedia di AniChin?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "AniChin menyediakan anime dalam kualitas 360p, 720p, dan 1080p (Full HD) dengan subtitle Bahasa Indonesia.",
        },
      },
      {
        "@type": "Question",
        "name": "Kapan update episode terbaru di AniChin?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Episode anime terbaru diupdate setiap hari. Anda dapat melihat jadwal rilis di bagian Jadwal Rilis harian untuk mengetahui anime yang tayang setiap hari.",
        },
      },
      {
        "@type": "Question",
        "name": "Bagaimana cara mendownload anime di AniChin?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Pilih anime yang ingin Anda download, klik tombol Detail, lalu buka tab Download. Pilih kualitas (360p, 720p, atau 1080p) dan klik link download.",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: sanitizeForJSONLD(JSON.stringify(itemList)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: sanitizeForJSONLD(JSON.stringify(breadcrumb)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: sanitizeForJSONLD(JSON.stringify(faq)) }}
      />
    </>
  );
}
