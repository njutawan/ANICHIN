/**
 * POST /api/auth/register — buat akun baru.
 *
 * F-12: respons untuk "email baru" dan "email sudah terdaftar" **identik**
 * (`201 { registered: true }`) supaya endpoint ini tidak bisa dipakai untuk
 * memeriksa apakah sebuah email punya akun. Akun baru dibuat belum terverifikasi;
 * link verifikasi dikirim ke inbox dan tidak ada sesi yang dibuat.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashSync, isValidEmail } from '@/lib/auth';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { sanitizeDisplayName, PASSWORD_MAX_BYTES, isPasswordTooLong } from '@/lib/security';
import {
  createVerificationToken,
  sendAccountExistsEmail,
  sendVerificationEmail,
} from '@/lib/email';

// Validation constants
const NAME_MIN = 2;
const NAME_MAX = 30;
const PASS_MIN = 6;
/** Batas keras jumlah karakter (jaga-jaga sebelum cek byte; lihat F-17). */
const PASS_MAX_CHARS = 128;

/**
 * Password strength: minimal 6 karakter, harus ada huruf dan angka, dan
 * maksimal `PASSWORD_MAX_BYTES` (72) byte UTF-8 — batas bcrypt (F-17).
 */
function isPasswordStrongEnough(pwd: string): boolean {
  if (pwd.length < PASS_MIN || pwd.length > PASS_MAX_CHARS) return false;
  if (isPasswordTooLong(pwd)) return false;
  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  return hasLetter && hasNumber;
}

/**
 * Respons pendaftaran yang SELALU sama (F-12).
 *
 * Tidak mengembalikan identitas user maupun status pengiriman email agar respons
 * tidak membocorkan apakah alamat sudah terdaftar. Akun baru tetap nonaktif
 * sampai pemilik mailbox mengklik link verifikasi.
 */
function registeredResponse(): NextResponse {
  return addRateLimitHeaders(
    NextResponse.json({ registered: true }, { status: 201 }),
    'expensive'
  );
}

/**
 * Kirim email "email ini sudah terdaftar" (best-effort).
 *
 * Kegagalan pengiriman tidak boleh mengubah respons maupun menggagalkan
 * pendaftaran — kalau SMTP belum dikonfigurasi, `deliverEmail` hanya mencatat
 * di server (tanpa token, jadi aman) dan fungsi ini tetap selesai.
 */
async function notifyAccountExists(email: string): Promise<void> {
  const baseUrl = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin;
  try {
    await sendAccountExistsEmail(email, `${baseUrl}/auth/login`);
  } catch (err) {
    logger.warn('[register] gagal mengirim notifikasi email terdaftar', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Best-effort send; never expose verification tokens or account existence. */
async function sendVerificationToUser(userId: string, email: string): Promise<void> {
  try {
    const { token } = await createVerificationToken(userId);
    const baseUrl = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin;
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
    const result = await sendVerificationEmail(email, verificationUrl);
    if (!result.delivered) {
      logger.warn('[register] verification email delivery failed');
    }
  } catch (err) {
    logger.warn('[register] failed to create/send verification email', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
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

    // Panjang password dalam BYTE, bukan karakter (F-17): bcrypt hanya memakai
    // 72 byte pertama dan diam-diam mengabaikan sisanya — jadi password yang
    // lebih panjang dari itu tidak menambah keamanan sama sekali.
    if (isPasswordTooLong(password)) {
      return NextResponse.json(
        {
          error: `Password terlalu panjang (maksimal ${PASSWORD_MAX_BYTES} byte; karakter non-ASCII dihitung lebih dari satu).`,
        },
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

    // Cek duplikat email — HANYA untuk memutuskan kirim notifikasi, bukan untuk
    // membentuk respons (F-12). Pendaftar tidak boleh bisa membedakan "email
    // baru" dari "email sudah terdaftar" lewat status/body/error, karena itu
    // jalur enumerasi akun. Pemilik email yang sah diberi tahu lewat email.
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, emailVerified: true },
    });
    if (existing) {
      if (existing.emailVerified) {
        await notifyAccountExists(normalizedEmail);
      } else {
        // Legacy/unverified accounts use the public mailbox proof flow too.
        await sendVerificationToUser(existing.id, normalizedEmail);
      }
      return registeredResponse();
    }

    // Hash password (cost 10 — balance security vs perf)
    const hashedPassword = hashSync(password, 10);

    // Sanitize display name (strip any HTML)
    const safeName = sanitizeDisplayName(trimmedName);

    // Create user — if email race-condition occurs, unique constraint throws.
    // Hasilnya tidak dipakai di respons (respons sengaja seragam, F-12).
    const created = await db.user.create({
      data: { email: normalizedEmail, name: safeName, password: hashedPassword, emailVerified: null },
      select: { id: true },
    });

    await sendVerificationToUser(created.id, normalizedEmail);
    return registeredResponse();
  } catch (err: unknown) {
    // Prisma unique constraint violation (P2002) — balapan dua pendaftaran
    // dengan email sama. Responsnya WAJIB sama dengan jalur sukses (F-12),
    // kalau tidak, 409 tetap membocorkan keberadaan email.
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return registeredResponse();
    }
    // Don't leak internal errors
    return NextResponse.json(
      { error: 'Gagal mendaftar. Coba lagi.' },
      { status: 500 }
    );
  }
}
