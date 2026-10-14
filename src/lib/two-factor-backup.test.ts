/**
 * Regresi audit F-10 — kode cadangan 2FA benar-benar tersimpan & sekali pakai.
 *
 * Sebelum perbaikan: kode cadangan hanya dikirim ke klien saat enable lalu
 * hilang (skema tidak punya tempat menyimpannya), sehingga `SECURITY.md` pun
 * menyatakan kode itu tidak bisa dipakai login. Pengguna yang kehilangan
 * authenticator terkunci dari akunnya sendiri.
 *
 * Kontrak yang dikunci di sini:
 *  - yang masuk database hanya hash bcrypt (tidak ada kode plaintext),
 *  - kode sekali pakai: klaim `usedAt` atomik — yang gagal klaim tidak lolos,
 *  - input berbentuk salah ditolak tanpa menyentuh DB/bcrypt,
 *  - regenerate/disable menghapus kode lama.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock } = vi.hoisted(() => {
  const twoFactorBackupCode = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    count: vi.fn(),
  };
  return {
    dbMock: {
      twoFactorBackupCode,
      // Meniru `$transaction([...])` bentuk array: menjalankan semua operasi.
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    },
  };
});

vi.mock('@/lib/db', () => ({ db: dbMock }));

import {
  clearBackupCodes,
  consumeBackupCode,
  countRemainingBackupCodes,
  saveBackupCodes,
} from '@/lib/two-factor-backup';
import { generateBackupCodes, hashBackupCodes } from '@/lib/two-factor';

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.twoFactorBackupCode.deleteMany.mockResolvedValue({ count: 0 });
  dbMock.twoFactorBackupCode.createMany.mockResolvedValue({ count: 8 });
  dbMock.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 1 });
  dbMock.twoFactorBackupCode.count.mockResolvedValue(0);
});

describe('saveBackupCodes', () => {
  it('hanya menyimpan hash bcrypt — tidak ada kode plaintext di database', async () => {
    const codes = ['AAAAA-BBBBB', 'CCCCC-DDDDD'];

    await saveBackupCodes('user-1', codes);

    const created = dbMock.twoFactorBackupCode.createMany.mock.calls[0][0].data as {
      userId: string;
      codeHash: string;
    }[];
    expect(created).toHaveLength(2);
    expect(created.every((row) => row.userId === 'user-1')).toBe(true);

    for (const row of created) {
      expect(row.codeHash).toMatch(/^\$2[aby]\$/); // bcrypt
      expect(codes).not.toContain(row.codeHash);
    }
    // Hash tidak deterministik → dua kode identik pun menghasilkan hash berbeda.
    expect(created[0].codeHash).not.toBe(created[1].codeHash);
  });

  it('menghapus kode lama sebelum menyimpan yang baru (regenerate membatalkan kode lama)', async () => {
    await saveBackupCodes('user-1', generateBackupCodes(2));

    expect(dbMock.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
    expect(dbMock.twoFactorBackupCode.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('consumeBackupCode', () => {
  it('kode valid yang belum dipakai → true dan ditandai terpakai (sekali klaim)', async () => {
    const [codes, hashes] = await (async () => {
      const c = generateBackupCodes(3);
      return [c, await hashBackupCodes(c)] as const;
    })();
    dbMock.twoFactorBackupCode.findMany.mockResolvedValue([
      { id: 'row-1', codeHash: hashes[0] },
      { id: 'row-2', codeHash: hashes[1] },
      { id: 'row-3', codeHash: hashes[2] },
    ]);

    await expect(consumeBackupCode('user-1', codes[2])).resolves.toBe(true);

    // Hanya baris yang cocok yang diklaim, dengan syarat `usedAt: null`.
    expect(dbMock.twoFactorBackupCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'row-3', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('kode yang sudah dipakai (klaim gagal / count 0) → false', async () => {
    const [code] = generateBackupCodes(1);
    const [codeHash] = await hashBackupCodes([code]);
    dbMock.twoFactorBackupCode.findMany.mockResolvedValue([{ id: 'row-1', codeHash }]);
    // Balapan: request lain sudah lebih dulu mengisi `usedAt`.
    dbMock.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(consumeBackupCode('user-1', code)).resolves.toBe(false);
  });

  it('kode salah → false tanpa menandai apa pun', async () => {
    const [codes, hashes] = await (async () => {
      const c = generateBackupCodes(1);
      return [c, await hashBackupCodes(c)] as const;
    })();
    dbMock.twoFactorBackupCode.findMany.mockResolvedValue([
      { id: 'row-1', codeHash: hashes[0] },
    ]);

    await expect(consumeBackupCode('user-1', 'FFFFF-FFFFF')).resolves.toBe(false);
    expect(codes[0]).not.toBe('FFFFF-FFFFF');
    expect(dbMock.twoFactorBackupCode.updateMany).not.toHaveBeenCalled();
  });

  it('bentuk input yang tidak mungkin kode cadangan → false tanpa query DB', async () => {
    for (const bad of ['', '123456', 'ZZZZZ-ZZZZZ', 'AAAA-BBBB', null, undefined, 12345]) {
      await expect(consumeBackupCode('user-1', bad as string)).resolves.toBe(false);
    }
    expect(dbMock.twoFactorBackupCode.findMany).not.toHaveBeenCalled();
  });

  it('tanpa kode tersisa → false', async () => {
    dbMock.twoFactorBackupCode.findMany.mockResolvedValue([]);

    await expect(consumeBackupCode('user-1', 'AAAAA-BBBBB')).resolves.toBe(false);
    expect(dbMock.twoFactorBackupCode.updateMany).not.toHaveBeenCalled();
  });

  it('hanya memeriksa kode milik user tersebut dan yang belum dipakai', async () => {
    dbMock.twoFactorBackupCode.findMany.mockResolvedValue([]);

    await consumeBackupCode('user-9', 'AAAAA-BBBBB');

    expect(dbMock.twoFactorBackupCode.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-9', usedAt: null },
      select: { id: true, codeHash: true },
    });
  });
});

describe('countRemainingBackupCodes / clearBackupCodes', () => {
  it('menghitung hanya kode yang belum dipakai', async () => {
    dbMock.twoFactorBackupCode.count.mockResolvedValue(5);

    await expect(countRemainingBackupCodes('user-1')).resolves.toBe(5);
    expect(dbMock.twoFactorBackupCode.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
    });
  });

  it('clearBackupCodes menghapus semua kode milik user', async () => {
    await clearBackupCodes('user-1');

    expect(dbMock.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });
});
