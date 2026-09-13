import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['TV', 'Movie', 'OVA', 'ONA', 'Special'];
const ALLOWED_STATUSES = ['Ongoing', 'Completed', 'Upcoming'];
const ALLOWED_SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];

/**
 * Slugify a title: lowercase, replace non-alphanumeric with '-', trim dashes.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Generate a unique slug by appending -2, -3, ... if collision occurs.
 */
async function generateUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const candidate = slugify(base) || `anime-${Date.now()}`;
  let slug = candidate;
  let suffix = 2;
  while (true) {
    const existing = await db.anime.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) break;
    slug = `${candidate}-${suffix++}`;
    if (suffix > 9999) {
      slug = `${candidate}-${Date.now()}`;
      break;
    }
  }
  return slug;
}

/**
 * Parse comma-separated genre names → connect/create genre relations.
 */
async function resolveGenres(names: string[]) {
  const unique = Array.from(
    new Set(names.map((n) => n).map((s) => s.trim()).filter(Boolean))
  );
  if (unique.length === 0) return [];
  return Promise.all(
    unique.map(async (name) => {
      const slug = slugify(name);
      const genre = await db.genre.upsert({
        where: { slug },
        update: {},
        create: { name, slug },
      });
      return { genreId: genre.id };
    })
  );
}

// GET /api/admin/anime — list anime with pagination, search, filter
export async function GET(req: NextRequest) {
  try {
    const [, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const status = searchParams.get('status') || 'all';
    const type = searchParams.get('type') || 'all';
    const sort = searchParams.get('sort') || 'latest';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (type && type !== 'all') where.type = type;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
        { titleJp: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    let orderBy: Record<string, string> = { updatedAt: 'desc' };
    if (sort === 'score') orderBy = { score: 'desc' };
    else if (sort === 'views') orderBy = { views: 'desc' };
    else if (sort === 'title') orderBy = { title: 'asc' };
    else if (sort === 'oldest') orderBy = { createdAt: 'asc' };

    const [animes, total] = await Promise.all([
      db.anime.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          genres: { include: { genre: { select: { name: true } } } },
          _count: { select: { episodes: true } },
        },
      }),
      db.anime.count({ where }),
    ]);

    const body = {
      animes: animes.map((a) => {
        const { _count, ...rest } = a;
        return {
          ...rest,
          genres: a.genres.map((g) => g.genre.name),
          episodeCount: _count.episodes,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return addRateLimitHeaders(NextResponse.json(body), 'expensive');
  } catch (err) {
    logger.error('admin/anime GET failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/anime',
    });
    return NextResponse.json(
      { error: 'Gagal memuat daftar anime.' },
      { status: 500 }
    );
  }
}

// POST /api/admin/anime — create new anime
export async function POST(req: NextRequest) {
  try {
    const [session, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body request tidak valid.' },
        { status: 400 }
      );
    }

    const title = (body.title ?? '').toString().trim();
    const synopsis = (body.synopsis ?? '').toString().trim();
    const poster = (body.poster ?? '').toString().trim();

    if (!title) {
      return NextResponse.json(
        { error: 'Judul wajib diisi.' },
        { status: 400 }
      );
    }
    if (title.length > 200) {
      return NextResponse.json(
        { error: 'Judul terlalu panjang (maks 200 karakter).' },
        { status: 400 }
      );
    }
    if (!synopsis) {
      return NextResponse.json(
        { error: 'Sinopsis wajib diisi.' },
        { status: 400 }
      );
    }
    if (!poster) {
      return NextResponse.json(
        { error: 'URL poster wajib diisi.' },
        { status: 400 }
      );
    }

    const type = ALLOWED_TYPES.includes(body.type) ? body.type : 'TV';
    const status = ALLOWED_STATUSES.includes(body.status) ? body.status : 'Ongoing';
    const season = body.season && ALLOWED_SEASONS.includes(body.season) ? body.season : null;

    const slug = await generateUniqueSlug(body.slug?.toString().trim() || title);

    const releasedYear = toInt(body.releasedYear, null, 1900, 2100);
    const totalEpisodes = toInt(body.totalEpisodes, null, 0, 10000);
    const releasedEpisodes = toInt(body.releasedEpisodes, null, 0, 10000);
    const rank = toInt(body.rank, null, 1, 100000);
    const score = toFloat(body.score, 0, 0, 10);
    const views = toInt(body.views, 0, 0, Number.MAX_SAFE_INTEGER);

    const genres = Array.isArray(body.genres) ? body.genres : [];
    const genreConnects = await resolveGenres(genres);

    const anime = await db.anime.create({
      data: {
        slug,
        title,
        titleEn: optionalStr(body.titleEn),
        titleJp: optionalStr(body.titleJp),
        alternativeTitle: optionalStr(body.alternativeTitle),
        synopsis,
        poster,
        banner: optionalStr(body.banner),
        type,
        status,
        studio: optionalStr(body.studio),
        source: optionalStr(body.source),
        releasedYear,
        season,
        score,
        rating: optionalStr(body.rating),
        views,
        duration: optionalStr(body.duration),
        airedDay: optionalStr(body.airedDay),
        trailer: optionalStr(body.trailer),
        featured: !!body.featured,
        trending: !!body.trending,
        popular: !!body.popular,
        rank,
        totalEpisodes,
        releasedEpisodes,
        genres: { create: genreConnects },
      },
      include: {
        genres: { include: { genre: { select: { name: true } } } },
      },
    });

    logger.info('Anime created by admin', {
      animeId: anime.id,
      slug: anime.slug,
      adminId: session!.user.id,
      module: 'api/admin/anime',
    });

    return NextResponse.json(
      {
        anime: {
          ...anime,
          genres: anime.genres.map((g) => g.genre.name),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error('admin/anime POST failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/anime',
    });
    return NextResponse.json(
      { error: 'Gagal membuat anime baru.' },
      { status: 500 }
    );
  }
}

// ── helpers ──
function optionalStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s.slice(0, 1000);
}

function toInt(v: unknown, fallback: number, min: number, max: number): number;
function toInt(v: unknown, fallback: null, min: number, max: number): number | null;
function toInt(v: unknown, fallback: number | null, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toFloat(v: unknown, fallback: number, min: number, max: number): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
