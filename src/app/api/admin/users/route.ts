import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// User shape returned to the admin client — never includes password, twoFactorSecret, tokens.
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  role: true,
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      reviews: true,
      comments: true,
    },
  },
} as const;

// GET /api/admin/users — list users with pagination + email search
export async function GET(req: NextRequest) {
  try {
    const [, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const role = searchParams.get('role') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (role === 'admin' || role === 'user') {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: USER_SELECT,
      }),
      db.user.count({ where }),
    ]);

    const body = {
      users: users.map((u) => ({
        ...u,
        reviewCount: u._count.reviews,
        commentCount: u._count.comments,
        _count: undefined,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return addRateLimitHeaders(NextResponse.json(body), 'expensive');
  } catch (err) {
    logger.error('admin/users GET failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/users',
    });
    return NextResponse.json(
      { error: 'Gagal memuat daftar pengguna.' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users — promote/demote a user (role update)
export async function PATCH(req: NextRequest) {
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

    const userId = String(body.userId || '').trim();
    const role = String(body.role || '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'userId wajib diisi.' }, { status: 400 });
    }
    if (role !== 'admin' && role !== 'user') {
      return NextResponse.json(
        { error: 'Role tidak valid. Hanya "admin" atau "user".' },
        { status: 400 }
      );
    }

    // Prevent self-demotion (would lock admin out)
    if (session!.user.id === userId && role !== 'admin') {
      return NextResponse.json(
        { error: 'Tidak bisa menurunkan role akun sendiri.' },
        { status: 400 }
      );
    }

    const target = await db.user.findUnique({
      where: { id: userId.slice(0, 64) },
      select: { id: true, email: true, role: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: 'Pengguna tidak ditemukan.' },
        { status: 404 }
      );
    }

    const updated = await db.user.update({
      where: { id: target.id },
      data: { role },
      select: USER_SELECT,
    });

    logger.info('User role updated by admin', {
      targetId: target.id,
      targetEmail: target.email,
      oldRole: target.role,
      newRole: role,
      adminId: session!.user.id,
      module: 'api/admin/users',
    });

    return NextResponse.json({
      user: {
        ...updated,
        reviewCount: updated._count.reviews,
        commentCount: updated._count.comments,
        _count: undefined,
      },
    });
  } catch (err) {
    logger.error('admin/users PATCH failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/users',
    });
    return NextResponse.json(
      { error: 'Gagal memperbarui role pengguna.' },
      { status: 500 }
    );
  }
}
