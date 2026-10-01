import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireAdmin } from '@/lib/session';
import { db } from '@/lib/db';

// Cache for 5 minutes (300 seconds)
// NOTE: cache is bypassed when auth is required (dynamic response per-user)
export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // --- Admin-only access ---
    // Analytics exposes aggregated stats (studios, score distributions) — protect from public scraping
    const [, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    // --- Rate limiting ---
    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;
    // ── Parallel queries (3 instead of 6 sequential) ──
    const [genres, allAnime, top10, statusCounts, seasonCounts] = await Promise.all([
      // 1. Genres with counts
      db.genre.findMany({
        include: { _count: { select: { animes: true } } },
      }),
      // 2. All anime (single fetch — derive type, score, studio distributions in-memory)
      db.anime.findMany({
        select: { studio: true, score: true, views: true, slug: true, title: true, poster: true, status: true, type: true },
      }),
      // 3. Top 10 by views
      db.anime.findMany({
        orderBy: { views: 'desc' },
        take: 10,
        select: { slug: true, title: true, titleJp: true, poster: true, score: true, views: true, type: true, rank: true },
      }),
      // 4. Status distribution
      db.anime.groupBy({ by: ['status'], _count: true }),
      // 5. Season distribution
      db.anime.groupBy({ by: ['season'], _count: true }),
    ]);

    // ── Derive distributions in-memory (no extra DB queries) ──

    const genreDist = genres
      .filter((g) => g._count.animes > 0)
      .map((g) => ({ name: g.name, slug: g.slug, count: g._count.animes }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const studioMap: Record<string, { count: number; totalViews: number; scores: number[]; topAnime: { slug: string; title: string; poster: string; score: number }[] }> = {};
    for (const a of allAnime) {
      const studio = a.studio || 'Unknown';
      if (!studioMap[studio]) studioMap[studio] = { count: 0, totalViews: 0, scores: [], topAnime: [] };
      studioMap[studio].count++;
      studioMap[studio].totalViews += a.views;
      studioMap[studio].scores.push(a.score);
      studioMap[studio].topAnime.push({ slug: a.slug, title: a.title, poster: a.poster, score: a.score });
    }
    const studioBoard = Object.entries(studioMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        totalViews: data.totalViews,
        avgScore: data.scores.length > 0 ? data.scores.reduce((s, v) => s + v, 0) / data.scores.length : 0,
        topAnime: data.topAnime.sort((a, b) => b.score - a.score)[0],
      }))
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 10);

    const typeDist = [
      { name: 'TV', value: allAnime.filter((a) => a.type === 'TV').length },
      { name: 'Movie', value: allAnime.filter((a) => a.type === 'Movie').length },
      { name: 'OVA', value: allAnime.filter((a) => a.type === 'OVA').length },
      { name: 'ONA', value: allAnime.filter((a) => a.type === 'ONA').length },
    ].filter((t) => t.value > 0);

    const scoreDist = [
      { range: '8.0–8.4', count: allAnime.filter((a) => a.score >= 8.0 && a.score < 8.5).length },
      { range: '8.5–8.9', count: allAnime.filter((a) => a.score >= 8.5 && a.score < 9.0).length },
      { range: '9.0+', count: allAnime.filter((a) => a.score >= 9.0).length },
    ];

    const statusDist = statusCounts.map((s) => ({
      name: s.status,
      value: s._count,
      color: s.status === 'Ongoing' ? '#22c55e' : s.status === 'Completed' ? '#3b82f6' : '#f59e0b',
    }));

    const seasonDist = seasonCounts
      .filter((s) => s.season)
      .map((s) => ({ name: s.season!, count: s._count }));

    return NextResponse.json({ genreDist, studioBoard, typeDist, scoreDist, top10, statusDist, seasonDist });
  } catch {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
