-- ============================================================================
-- Kode cadangan 2FA sekali pakai (F-10 pada docs/SECURITY-AUDIT.md).
--
-- Sebelumnya kode cadangan hanya ditampilkan sekali dan TIDAK disimpan, jadi
-- tidak bisa dipakai login: pengguna yang kehilangan authenticator terkunci
-- dari akunnya sendiri. Tabel ini menyimpan hash bcrypt tiap kode; `usedAt`
-- diisi tepat sekali saat kode dipakai, sehingga kode bersifat sekali pakai.
--
-- Tanpa backfill: kode lama memang tidak pernah bisa dipakai, jadi tidak ada
-- data yang perlu dipindahkan. Pengguna yang sudah mengaktifkan 2FA dianjurkan
-- menekan "regenerate" di halaman /auth/2fa setelah migrasi ini.
-- ============================================================================

-- CreateTable
CREATE TABLE "TwoFactorBackupCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TwoFactorBackupCode_userId_usedAt_idx" ON "TwoFactorBackupCode"("userId", "usedAt");

-- AddForeignKey
ALTER TABLE "TwoFactorBackupCode" ADD CONSTRAINT "TwoFactorBackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
