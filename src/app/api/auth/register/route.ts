import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashSync, isValidEmail } from '@/lib/auth';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeDisplayName } from '@/lib/security';

// Validation constants
const NAME_MIN = 2;
const NAME_MAX = 30;
const PASS_MIN = 6;
const PASS_MAX = 128;

// Password strength: must have at least one letter and one number
function isPasswordStrongEnough(pwd: string): boolean {
  if (pwd.length < PASS_MIN || pwd.length > PASS_MAX) return false;
  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  return hasLetter && hasNumber;
}

export async function POST(req: NextRequest) {
  try {
    // Stricter rate limit for registration (prevent account enumeration / spam)
    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    // Body size guard — prevent DoS via huge payloads
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > 8192) {
      return NextResponse.json(
        { error: 'Payload terlalu besar.' },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Format request tidak valid.' },
        { status: 400 }
      );
    }

    const { email, password, name } =
      (body ?? {}) as Record<string, unknown>;

    // Type checks
    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Email, password, dan nama wajib diisi.' },
        { status: 400 }
      );
    }

    // Normalize + validate email
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Format email tidak valid.' },
        { status: 400 }
      );
    }

    // Validate name
    const trimmedName = name.trim();
    if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) {
      return NextResponse.json(
        { error: `Nama harus ${NAME_MIN}-${NAME_MAX} karakter.` },
        { status: 400 }
      );
    }

    // Validate password strength
    if (!isPasswordStrongEnough(password)) {
      return NextResponse.json(
        {
          error: `Password minimal ${PASS_MIN} karakter, harus ada huruf dan angka.`,
        },
        { status: 400 }
      );
    }

    // Check duplicate email (race-safe via unique constraint, but pre-check for UX)
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      // Generic message — don't leak which emails exist
      return NextResponse.json(
        { error: 'Email sudah terdaftar.' },
        { status: 409 }
      );
    }

    // Hash password (cost 10 — balance security vs perf)
    const hashedPassword = hashSync(password, 10);

    // Sanitize display name (strip any HTML)
    const safeName = sanitizeDisplayName(trimmedName);

    // Create user — if email race-condition occurs, unique constraint throws
    const user = await db.user.create({
      data: { email: normalizedEmail, name: safeName, password: hashedPassword },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    return addRateLimitHeaders(
      NextResponse.json(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        { status: 201 }
      ),
      'expensive'
    );
  } catch (err: unknown) {
    // Prisma unique constraint violation (P2002) — email race condition
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Email sudah terdaftar.' },
        { status: 409 }
      );
    }
    // Don't leak internal errors
    return NextResponse.json(
      { error: 'Gagal mendaftar. Coba lagi.' },
      { status: 500 }
    );
  }
}
