/**
 * Regresi audit F-10 — login memakai kode cadangan 2FA (end-to-end dari
 * `authorize()`), plus penguncian perilaku lama:
 *
 *  - kode TOTP valid tetap bisa login,
 *  - kode cadangan valid bisa menggantikan TOTP **sekali** (kode kedua kali
 *    ditolak),
 *  - faktor kedua yang salah/gagal mencatat kegagalan (lockout) dan tidak
 *    membuat sesi,
 *  - akun `twoFactorEnabled` tanpa secret tidak lagi dilewatkan begitu saja.
 *
 * Modul `@/lib/db` dan `@/lib/rate-limit-store` di-mock; sisa jalur 2FA
 * (bcrypt, otplib, AES) memakai implementasi asli supaya yang diuji benar-benar
 * yang berjalan di produksi.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSync } from 'bcryptjs';
import { generateSync, generateSecret } from 'otplib';

const { dbMock, storeMock, ipMock, loggerMock } = vi.hoisted(() => {
  // Model in-memory kecil untuk TwoFactorBackupCode — cukup untuk menguji
  // semantik "sekali pakai" (klaim `usedAt: null` yang atomik).
  const backupCodes: { id: string; userId: string; codeHash: string; usedAt: Date | null }[] = [];
  let seq = 0;

  return {
    dbMock: {
      user: { findUnique: vi.fn() },
      twoFactorBackupCode: {
        findMany: vi.fn(async ({ where }: { where: { userId: string; usedAt: null } }) =>
          backupCodes
            .filter((row) => row.userId === where.userId && row.usedAt === null)
            .map((row) => ({ id: row.id, codeHash: row.codeHash }))
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; usedAt: null };
            data: { usedAt: Date };
          }) => {
            const row = backupCodes.find((r) => r.id === where.id && r.usedAt === null);
            if (!row) return { count: 0 };
            row.usedAt = data.usedAt;
            return { count: 1 };
          }
        ),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(
          async ({ data }: { data: { userId: string; codeHash: string }[] }) => {
            for (const item of data) {
              backupCodes.push({
                id: `bc-${++seq}`,
                userId: item.userId,
                codeHash: item.codeHash,
                usedAt: null,
              });
            }
            return { count: data.length };
          }
        ),
        count: vi.fn(async ({ where }: { where: { userId: string; usedAt: null } }) =>
          backupCodes.filter((r) => r.userId === where.userId && r.usedAt === null).length
        ),
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      __backupCodes: backupCodes,
    },
    storeMock: { isLocked: vi.fn(), incrFails: vi.fn(), clearFails: vi.fn() },
    ipMock: { getClientIp: vi.fn(() => '203.0.113.7') },
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
vi.mock('@/lib/rate-limit-store', () => storeMock);
vi.mock('@/lib/ip', () => ipMock);

import { authOptions } from '@/lib/auth';
import { encryptSecret } from '@/lib/two-factor';
import { saveBackupCodes } from '@/lib/two-factor-backup';

type AuthorizeFn = (
  credentials: Record<string, string> | undefined,
  req: unknown
) => Promise<unknown>;

// NextAuth memanggil `options.authorize`: `core/lib/providers.js` melakukan
// `merge(rest, userOptions)`, jadi implementasi asli berada di dalam `options`
// (properti `authorize` di luar hanyalah stub `() => null`).
const provider = authOptions.providers[0] as unknown as {
  options: { authorize: AuthorizeFn };
};
const authorize = {
  authorize: (credentials: Record<string, string> | undefined, req: unknown) =>
    provider.options.authorize(credentials, req),
};

const PASSWORD = 'password-yang-benar';
// otplib v13 menolak secret < 16 byte, jadi pakai generator aplikasi.
const TOTP_SECRET = generateSecret();

function storedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'u@example.com',
    name: 'User Uji',
    password: hashSync(PASSWORD, 10),
    role: 'user',
    emailVerified: new Date(),
    twoFactorEnabled: true,
    twoFactorSecret: encryptSecret(TOTP_SECRET),
    ...overrides,
  };
}

function creds(totp?: string) {
  return { email: 'u@example.com', password: PASSWORD, ...(totp ? { totp } : {}) };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.__backupCodes.length = 0;
  storeMock.isLocked.mockResolvedValue(false);
  storeMock.incrFails.mockResolvedValue(1);
  storeMock.clearFails.mockResolvedValue(undefined);
  dbMock.user.findUnique.mockResolvedValue(storedUser());
});

describe('authorize() — 2FA lewat kode cadangan (F-10)', () => {
  it('kode TOTP valid tetap bisa login', async () => {
    const token = generateSync({ secret: TOTP_SECRET });

    const user = await authorize.authorize(creds(token), {});

    expect(user).toMatchObject({ id: 'user-1', email: 'u@example.com', role: 'user' });
    expect(storeMock.clearFails).toHaveBeenCalled();
  });

  it('kode cadangan valid menggantikan TOTP dan langsung dihabiskan', async () => {
    const codes = ['AAAAA-BBBBB', 'CCCCC-DDDDD'];
    await saveBackupCodes('user-1', codes);
    const remainingBefore = dbMock.__backupCodes.filter((r) => r.usedAt === null).length;

    const user = await authorize.authorize(creds(codes[0]), {});

    expect(user).toMatchObject({ id: 'user-1' });
    // Kode yang dipakai ditandai terpakai → sisa kode berkurang satu.
    expect(dbMock.__backupCodes.filter((r) => r.usedAt === null)).toHaveLength(
      remainingBefore - 1
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[auth] login memakai kode cadangan 2FA',
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('kode cadangan yang sama tidak bisa dipakai dua kali', async () => {
    const [code] = ['ABCDE-12345'];
    await saveBackupCodes('user-1', [code]);

    await expect(authorize.authorize(creds(code), {})).resolves.toMatchObject({ id: 'user-1' });
    storeMock.incrFails.mockClear();

    await expect(authorize.authorize(creds(code), {})).resolves.toBeNull();
    // Percobaan gagal tetap dicatat supaya lockout berlaku.
    expect(storeMock.incrFails).toHaveBeenCalled();
  });

  it('kode cadangan diterima dalam huruf kecil / tanpa dash', async () => {
    await saveBackupCodes('user-1', ['ABCDE-12345']);

    await expect(
      authorize.authorize(creds('abcde12345'), {})
    ).resolves.toMatchObject({ id: 'user-1' });
  });

  it('kode cadangan salah → null dan mencatat kegagalan', async () => {
    await saveBackupCodes('user-1', ['ABCDE-12345']);

    await expect(authorize.authorize(creds('FFFFF-FFFFF'), {})).resolves.toBeNull();
    // Kunci lockout = email + IP (lihat auth.ts), dengan jendela lockout.
    expect(storeMock.incrFails).toHaveBeenCalledWith(
      'u@example.com::203.0.113.7',
      expect.any(Number)
    );
    expect(storeMock.clearFails).not.toHaveBeenCalled();
  });

  it('TOTP salah → tidak mencoba kode cadangan dan tetap gagal', async () => {
    await saveBackupCodes('user-1', ['ABCDE-12345']);

    await expect(authorize.authorize(creds('000000'), {})).resolves.toBeNull();
    expect(dbMock.__backupCodes.filter((r) => r.usedAt === null)).toHaveLength(1);
  });

  it('tanpa kode sama sekali → sinyal 2FA_REQUIRED (bukan salah password)', async () => {
    await expect(authorize.authorize(creds(), {})).rejects.toThrow('2FA_REQUIRED');
  });

  it('akun 2FA tanpa secret tetap wajib faktor kedua (fail closed)', async () => {
    dbMock.user.findUnique.mockResolvedValue(storedUser({ twoFactorSecret: null }));

    await expect(authorize.authorize(creds('123456'), {})).resolves.toBeNull();
    expect(storeMock.incrFails).toHaveBeenCalled();
  });

  it('kode cadangan tidak dianggap sah untuk akun tanpa 2FA aktif', async () => {
    dbMock.user.findUnique.mockResolvedValue(storedUser({ twoFactorEnabled: false }));
    await saveBackupCodes('user-1', ['ABCDE-12345']);

    // Kode di kolom `totp` tidak dipakai bila 2FA tidak aktif.
    await expect(authorize.authorize(creds('ABCDE-12345'), {})).resolves.toMatchObject({
      id: 'user-1',
    });
    expect(dbMock.__backupCodes.filter((r) => r.usedAt === null)).toHaveLength(1);
  });

  it('error DB saat mengonsumsi kode → fail closed', async () => {
    dbMock.twoFactorBackupCode.findMany.mockRejectedValueOnce(new Error('db down'));
    await saveBackupCodes('user-1', ['ABCDE-12345']);

    await expect(authorize.authorize(creds('ABCDE-12345'), {})).resolves.toBeNull();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('akun terkunci tidak sampai memeriksa faktor kedua', async () => {
    storeMock.isLocked.mockResolvedValue(true);
    await saveBackupCodes('user-1', ['ABCDE-12345']);

    await expect(authorize.authorize(creds('ABCDE-12345'), {})).resolves.toBeNull();
    expect(dbMock.twoFactorBackupCode.findMany).not.toHaveBeenCalled();
  });
});
