import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit-log';

// Cache for 2 minutes — anime detail doesn't change often
export const revalidate = 120;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const limited = await checkRateLimit(req, 'read');
    if (limited) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      auditLog.rateLimitHit(ip, '/api/anime/[slug]', 'read');
      return limited;
    }

    const { slug } = await params;
    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 100);
    if (!safeSlug || safeSlug !== slug) {
      auditLog.suspiciousRequest(
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        `/api/anime/${slug}`,
        'path_traversal'
      );
      return addRateLimitHeaders(
        NextResponse.json({ error: 'Not found' }, { status: 404 }),
        'read'
      );
    }

    // Fetch anime with selective includes (only what's needed for detail modal)
    const anime = await db.anime.findUnique({
      where: { slug },
      select: {
        id: true, slug: true, title: true, titleEn: true, titleJp: true,
        synopsis: true, poster: true, banner: true, type: true, status: true,
        studio: true, source: true, releasedYear: true, season: true,
        score: true, rating: true, views: true, duration: true, airedDay: true,
        trailer: true, featured: true, trending: true, popular: true, rank: true,
        totalEpisodes: true, releasedEpisodes: true,
        createdAt: true,
        genres: { select: { genre: { select: { name: true } } } },
        episodes: { select: { id: true, number: true, title: true, thumbnail: true, duration: true, releasedAt: true, views: true, streamUrl: true, download480: true, download720: true, download1080: true }, orderBy: { number: 'asc' } },
        characters: {
          select: {
            role: true,
            character: { select: { id: true, slug: true, name: true, nameJp: true, role: true, description: true, image: true } },
          },
        },
        staff: {
          select: {
            role: true,
            staff: { select: { id: true, slug: true, name: true, nameJp: true, role: true, image: true } },
          },
        },
      },
    });

    if (!anime) return addRateLimitHeaders(NextResponse.json({ error: 'Not found' }, { status: 404 }), 'read');

    // Defer view increment — fire and forget (non-blocking)
    db.anime.update({ where: { id: anime.id }, data: { views: { increment: 1 } } }).catch(() => {});

    // Fetch relations separately (lighter query)
    const [relationsFrom, relationsTo] = await Promise.all([
      db.animeRelation.findMany({
        where: { fromAnimeId: anime.id },
        select: {
          relation: true,
          toAnime: {
            select: { id: true, slug: true, title: true, titleJp: true, poster: true, type: true, status: true, score: true, views: true, rank: true, releasedEpisodes: true, totalEpisodes: true },
          },
        },
      }),
      db.animeRelation.findMany({
        where: { toAnimeId: anime.id },
        select: {
          relation: true,
          fromAnime: {
            select: { id: true, slug: true, title: true, titleJp: true, poster: true, type: true, status: true, score: true, views: true, rank: true, releasedEpisodes: true, totalEpisodes: true },
          },
        },
      }),
    ]);

    const reverseMap: Record<string, string> = {
      'Sequel': 'Prequel', 'Prequel': 'Sequel',
      'Side Story': 'Parent Story', 'Parent Story': 'Side Story',
      'Alternative': 'Alternative', 'Spin-off': 'Parent Story',
    };

    const outgoing = relationsFrom.map((r) => ({ anime: r.toAnime, relation: r.relation }));
    const incoming = relationsTo.map((r) => ({ anime: r.fromAnime, relation: reverseMap[r.relation] || r.relation }));
    const relations = [...outgoing, ...incoming];

    const responseBody = {
      ...anime,
      genres: anime.genres.map(g => g.genre.name),
      characters: anime.characters.map((c) => ({
        id: c.character.id,
        slug: c.character.slug,
        name: c.character.name,
        nameJp: c.character.nameJp,
        role: c.role ?? c.character.role,
        description: c.character.description,
        image: c.character.image,
      })),
      staff: anime.staff.map((s) => ({
        id: s.staff.id,
        slug: s.staff.slug,
        name: s.staff.name,
        nameJp: s.staff.nameJp,
        role: s.role ?? s.staff.role,
        image: s.staff.image,
      })),
      relations,
    };

    return addRateLimitHeaders(NextResponse.json(responseBody), 'read');
  } catch {
    auditLog.apiError('/api/anime/[slug]', 'GET', 500, 'Database query failed');
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
