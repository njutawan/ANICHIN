-- ============================================================================
-- Perf indexes (code review 2026-10-02)
--
-- Menambahkan index untuk tiga query terpanas yang sebelumnya melakukan
-- sequential scan + sort:
--   1. Anime.updatedAt          → GET /api/anime?sort=latest, sitemap
--   2. ServerReview(animeSlug, createdAt)      → GET /api/reviews?animeSlug=…
--   3. ServerComment(animeSlug, episodeNumber, createdAt) → GET /api/comments…
--
-- Index komposit menggantikan index satu/dua kolom sebelumnya karena kolom
-- awalnya identik (index lama hanya jadi prefix yang redundan).
--
-- IF NOT EXISTS / IF EXISTS dipakai supaya migrasi tetap aman di database yang
-- sebelumnya dikelola dengan `prisma db push` (index mungkin sudah ada).
-- ============================================================================

-- 1. Anime — sort terbaru + sitemap
CREATE INDEX IF NOT EXISTS "Anime_updatedAt_idx" ON "Anime"("updatedAt");

-- 2. ServerReview — daftar ulasan per anime, urut terbaru
CREATE INDEX IF NOT EXISTS "ServerReview_animeSlug_createdAt_idx"
  ON "ServerReview"("animeSlug", "createdAt");
DROP INDEX IF EXISTS "ServerReview_animeSlug_idx";

-- 3. ServerComment — komentar per episode, urut terbaru
CREATE INDEX IF NOT EXISTS "ServerComment_animeSlug_episodeNumber_createdAt_idx"
  ON "ServerComment"("animeSlug", "episodeNumber", "createdAt");
DROP INDEX IF EXISTS "ServerComment_animeSlug_episodeNumber_idx";
