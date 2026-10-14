/**
 * Kode cadangan 2FA — penyimpanan & konsumsi sekali pakai (F-10).
 *
 * Latar belakang: kode cadangan dulu hanya ditampilkan sekali di klien dan
 * **tidak pernah disimpan**, sehingga tidak bisa dipakai login. Akibatnya
 * pengguna yang kehilangan authenticator terkunci dari akunnya sendiri, dan
 * janji "simpan kode ini" di UI tidak punya arti.
 *
 * Aturan modul ini:
 *  - Yang masuk database hanya **hash bcrypt** (`hashBackupCodes` di
 *    src/lib/two-factor.ts). Kode plaintext hanya hidup di memori selama
 *    respons pembuatan dikirim ke pemilik akun.
 *  - Setiap kode **sekali pakai**. Konsumsi diklaim dengan `updateMany` yang
 *    mensyaratkan `usedAt: null` — kalau dua login memakai kode yang sama
 *    bersamaan, hanya satu yang mendapat `count === 1` dan boleh lanjut.
 *  - Kode tidak kedaluwarsa (perilaku yang sama dengan GitHub/Google): selama
 *    belum dipakai ia tetap berlaku, dan pengguna bisa me-regenerate kapan saja
 *    (yang otomatis membatalkan semua kode lama).
 *
 * Modul ini menyentuh DB, jadi test-nya mem-mock `@/lib/db` (lihat
 * src/lib/two-factor-backup.test.ts).
 */

import { db } from '@/lib/db';
import {
  hashBackupCodes,
  matchBackupCodeHash,
  normalizeBackupCode,
} from '@/lib/two-factor';

/**
 * Simpan satu set kode cadangan baru untuk user, menggantikan semua kode lama
 * (dipakai maupun belum). Dipanggil dari /2fa/enable dan /2fa/backup-codes.
 *
 * `hashes` dihitung pemanggil supaya bcrypt (CPU-bound) tidak dijalankan di
 * dalam transaksi database.
 */
export async function saveBackupCodes(
  userId: string,
  codes: string[]
): Promise<void> {
  const codeHashes = await hashBackupCodes(codes);
  await db.$transaction([
    db.twoFactorBackupCode.deleteMany({ where: { userId } }),
    db.twoFactorBackupCode.createMany({
      data: codeHashes.map((codeHash) => ({ userId, codeHash })),
    }),
  ]);
}

/**
 * Verifikasi kode cadangan milik user dan tandai terpakai.
 *
 * Mengembalikan true HANYA bila kode valid **dan** klaim `usedAt` berhasil
 * (count === 1) — jadi kode yang sudah dipakai (atau sedang dipakai request
 * lain) tidak bisa lolos. Bcrypt compare dijalankan terhadap kode yang belum
 * terpakai saja.
 */
export async function consumeBackupCode(
  userId: string,
  candidate: string
): Promise<boolean> {
  // Prefilter murah: bentuk yang salah tidak perlu menyentuh DB/bcrypt.
  const canonical = normalizeBackupCode(candidate);
  if (!canonical) return false;

  const rows = await db.twoFactorBackupCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  if (rows.length === 0) return false;

  const matched = await matchBackupCodeHash(
    canonical,
    rows.map((row) => row.codeHash)
  );
  if (matched < 0) return false;

  const claimed = await db.twoFactorBackupCode.updateMany({
    where: { id: rows[matched].id, usedAt: null },
    data: { usedAt: new Date() },
  });

  return claimed.count === 1;
}

/** Jumlah kode cadangan yang belum dipakai (ditampilkan di halaman /auth/2fa). */
export async function countRemainingBackupCodes(userId: string): Promise<number> {
  return db.twoFactorBackupCode.count({ where: { userId, usedAt: null } });
}

/** Hapus semua kode cadangan (dipakai saat 2FA dinonaktifkan). */
export async function clearBackupCodes(userId: string): Promise<void> {
  await db.twoFactorBackupCode.deleteMany({ where: { userId } });
}
