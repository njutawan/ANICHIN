-- AlterTable
-- Penomoran sesi untuk pencabutan JWT (F-06 pada docs/SECURITY-AUDIT.md).
-- Default 0 = token lama (diterbitkan sebelum kolom ini ada) tetap valid sampai
-- validasi ulang pertama, lalu nilainya diadopsi dari DB.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
