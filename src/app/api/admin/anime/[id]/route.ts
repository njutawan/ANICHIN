import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['TV', 'Movie', 'OVA', 'ONA', 'Special'];
const ALLOWED_STATUSES = ['Ongoing', 'Completed', 'Upcoming'];
const ALLOWED_SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];

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
 * Generate a unique slug (excluding current anime's ID for PATCH updates).
 */
async function generateUniqueSlug(base: string, excludeId: string): Promise<string> {
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

async function resolveGenres(names: string[]) {
  const unique = Array.from(
    new Set(names.map((n) => String(n).trim()).filter(Boolean))
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

// GET /api/admin/anime/[id] — single anime with episodes + genres
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const { id } = await params;
    const safeId = id.slice(0, 64);

    const anime = await db.anime.findUnique({
      where: { id: safeId },
      include: {
        genres: { include: { genre: { select: { name: true } } } },
        episodes: {
          orderBy: { number: 'asc' },
          select: {
            id: true,
            number: true,
            title: true,
            thumbnail: true,
            duration: true,
            releasedAt: true,
            views: true,
            streamUrl: true,
            download480: true,
            download720: true,
            download1080: true,
          },
        },
      },
    });

    if (!anime) {
      return NextResponse.json(
        { error: 'Anime tidak ditemukan.' },
        { status: 404 }
      );
    }

    const { genres, ...rest } = anime;
    return addRateLimitHeaders(
      NextResponse.json({
        anime: {
          ...rest,
          genres: genres.map((g) => g.genre.name),
        },
      }),
      'expensive'
    );
  } catch (err) {
    logger.error('admin/anime/[id] GET failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/anime/[id]',
    });
    return NextResponse.json(
      { error: 'Gagal memuat detail anime.' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/anime/[id] — update anime fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [session, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const { id } = await params;
    const safeId = id.slice(0, 64);

    const existing = await db.anime.findUnique({
      where: { id: safeId },
      select: { id: true, slug: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Anime tidak ditemukan.' },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body request tidak valid.' },
        { status: 400 }
      );
    }

    // Build a partial update — only fields present in the body are touched
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        return NextResponse.json({ error: 'Judul tidak boleh kosong.' }, { status: 400 });
      }
      data.title = title.slice(0, 200);
    }
    if (body.synopsis !== undefined) {
      const synopsis = String(body.synopsis).trim();
      if (!synopsis) {
        return NextResponse.json({ error: 'Sinopsis tidak boleh kosong.' }, { status: 400 });
      }
      data.synopsis = synopsis;
    }
    if (body.poster !== undefined) data.poster = String(body.poster).trim();
    if (body.banner !== undefined) data.banner = optionalStr(body.banner);
    if (body.titleEn !== undefined) data.titleEn = optionalStr(body.titleEn);
    if (body.titleJp !== undefined) data.titleJp = optionalStr(body.titleJp);
    if (body.alternativeTitle !== undefined) data.alternativeTitle = optionalStr(body.alternativeTitle);
    if (body.studio !== undefined) data.studio = optionalStr(body.studio);
    if (body.source !== undefined) data.source = optionalStr(body.source);
    if (body.rating !== undefined) data.rating = optionalStr(body.rating);
    if (body.duration !== undefined) data.duration = optionalStr(body.duration);
    if (body.airedDay !== undefined) data.airedDay = optionalStr(body.airedDay);
    if (body.trailer !== undefined) data.trailer = optionalStr(body.trailer);

    if (body.type !== undefined) {
      data.type = ALLOWED_TYPES.includes(body.type) ? body.type : 'TV';
    }
    if (body.status !== undefined) {
      data.status = ALLOWED_STATUSES.includes(body.status) ? body.status : 'Ongoing';
    }
    if (body.season !== undefined) {
      data.season = body.season && ALLOWED_SEASONS.includes(body.season) ? body.season : null;
    }

    if (body.releasedYear !== undefined) data.releasedYear = toInt(body.releasedYear, null, 1900, 2100);
    if (body.totalEpisodes !== undefined) data.totalEpisodes = toInt(body.totalEpisodes, null, 0, 10000);
    if (body.releasedEpisodes !== undefined) data.releasedEpisodes = toInt(body.releasedEpisodes, null, 0, 10000);
    if (body.rank !== undefined) data.rank = toInt(body.rank, null, 1, 100000);
    if (body.score !== undefined) data.score = toFloat(body.score, 0, 0, 10);
    if (body.views !== undefined) data.views = toInt(body.views, 0, 0, Number.MAX_SAFE_INTEGER);

    if (body.featured !== undefined) data.featured = !!body.featured;
    if (body.trending !== undefined) data.trending = !!body.trending;
    if (body.popular !== undefined) data.popular = !!body.popular;

    // Slug update — regenerate uniqueness check
    if (body.slug !== undefined) {
      const slugRaw = String(body.slug).trim();
      if (slugRaw && slugRaw !== existing.slug) {
        data.slug = await generateUniqueSlug(slugRaw, safeId);
      }
    }

    // Genres update — replace entire set
    let genresReplaced = false;
    if (Array.isArray(body.genres)) {
      genresReplaced = true;
    }

    // Run update + optional genre swap in a transaction
    const anime = await db.$transaction(async (tx) => {
      if (genresReplaced) {
        await tx.animeGenre.deleteMany({ where: { animeId: safeId } });
        const genreConnects = await resolveGenres(body.genres);
        if (genreConnects.length > 0) {
          await tx.animeGenre.createMany({
            data: genreConnects.map((g) => ({ animeId: safeId, genreId: g.genreId })),
          });
        }
      }
      return tx.anime.update({
        where: { id: safeId },
        data,
        include: {
          genres: { include: { genre: { select: { name: true } } } },
        },
      });
    });

    logger.info('Anime updated by admin', {
      animeId: anime.id,
      slug: anime.slug,
      adminId: session!.user.id,
      module: 'api/admin/anime/[id]',
    });

    return NextResponse.json({
      anime: {
        ...anime,
        genres: anime.genres.map((g) => g.genre.name),
      },
    });
  } catch (err) {
    logger.error('admin/anime/[id] PATCH failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/anime/[id]',
    });
    return NextResponse.json(
      { error: 'Gagal memperbarui anime.' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/anime/[id] — cascade deletes episodes via Prisma onDelete: Cascade
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [session, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const { id } = await params;
    const safeId = id.slice(0, 64);

    const existing = await db.anime.findUnique({
      where: { id: safeId },
      select: { id: true, title: true, slug: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Anime tidak ditemukan.' },
        { status: 404 }
      );
    }

    // Prisma schema has onDelete: Cascade on episodes → will auto-delete
    await db.anime.delete({ where: { id: safeId } });

    logger.info('Anime deleted by admin', {
      animeId: safeId,
      slug: existing.slug,
      title: existing.title,
      adminId: session!.user.id,
      module: 'api/admin/anime/[id]',
    });

    return NextResponse.json({ success: true, id: safeId });
  } catch (err) {
    logger.error('admin/anime/[id] DELETE failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/anime/[id]',
    });
    return NextResponse.json(
      { error: 'Gagal menghapus anime.' },
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
