-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Anime" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "titleJp" TEXT,
    "alternativeTitle" TEXT,
    "synopsis" TEXT NOT NULL,
    "poster" TEXT NOT NULL,
    "banner" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TV',
    "status" TEXT NOT NULL DEFAULT 'Ongoing',
    "studio" TEXT,
    "source" TEXT,
    "releasedYear" INTEGER,
    "season" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "duration" TEXT,
    "airedDay" TEXT,
    "trailer" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "totalEpisodes" INTEGER,
    "releasedEpisodes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeRelation" (
    "id" TEXT NOT NULL,
    "fromAnimeId" TEXT NOT NULL,
    "toAnimeId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,

    CONSTRAINT "AnimeRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameJp" TEXT,
    "role" TEXT,
    "description" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeCharacter" (
    "animeId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "AnimeCharacter_pkey" PRIMARY KEY ("animeId","characterId")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameJp" TEXT,
    "role" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeStaff" (
    "animeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "AnimeStaff_pkey" PRIMARY KEY ("animeId","staffId")
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeGenre" (
    "animeId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "AnimeGenre_pkey" PRIMARY KEY ("animeId","genreId")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "thumbnail" TEXT,
    "duration" TEXT,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER NOT NULL DEFAULT 0,
    "streamUrl" TEXT,
    "download720" TEXT,
    "download1080" TEXT,
    "download480" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "emailVerified" TIMESTAMP(3),
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerReview" (
    "id" TEXT NOT NULL,
    "animeSlug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerComment" (
    "id" TEXT NOT NULL,
    "animeSlug" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Anime_slug_key" ON "Anime"("slug");

-- CreateIndex
CREATE INDEX "Anime_status_idx" ON "Anime"("status");

-- CreateIndex
CREATE INDEX "Anime_type_idx" ON "Anime"("type");

-- CreateIndex
CREATE INDEX "Anime_airedDay_idx" ON "Anime"("airedDay");

-- CreateIndex
CREATE INDEX "Anime_featured_idx" ON "Anime"("featured");

-- CreateIndex
CREATE INDEX "Anime_trending_idx" ON "Anime"("trending");

-- CreateIndex
CREATE INDEX "Anime_popular_idx" ON "Anime"("popular");

-- CreateIndex
CREATE INDEX "Anime_score_idx" ON "Anime"("score");

-- CreateIndex
CREATE INDEX "Anime_views_idx" ON "Anime"("views");

-- CreateIndex
CREATE INDEX "Anime_releasedYear_idx" ON "Anime"("releasedYear");

-- CreateIndex
CREATE INDEX "Anime_createdAt_idx" ON "Anime"("createdAt");

-- CreateIndex
CREATE INDEX "AnimeRelation_toAnimeId_idx" ON "AnimeRelation"("toAnimeId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimeRelation_fromAnimeId_toAnimeId_relation_key" ON "AnimeRelation"("fromAnimeId", "toAnimeId", "relation");

-- CreateIndex
CREATE UNIQUE INDEX "Character_slug_key" ON "Character"("slug");

-- CreateIndex
CREATE INDEX "Character_slug_idx" ON "Character"("slug");

-- CreateIndex
CREATE INDEX "AnimeCharacter_characterId_idx" ON "AnimeCharacter"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_slug_key" ON "Staff"("slug");

-- CreateIndex
CREATE INDEX "Staff_slug_idx" ON "Staff"("slug");

-- CreateIndex
CREATE INDEX "AnimeStaff_staffId_idx" ON "AnimeStaff"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_slug_key" ON "Genre"("slug");

-- CreateIndex
CREATE INDEX "AnimeGenre_genreId_idx" ON "AnimeGenre"("genreId");

-- CreateIndex
CREATE INDEX "Episode_animeId_idx" ON "Episode"("animeId");

-- CreateIndex
CREATE INDEX "Episode_releasedAt_idx" ON "Episode"("releasedAt");

-- CreateIndex
CREATE INDEX "Episode_number_idx" ON "Episode"("number");

-- CreateIndex
CREATE INDEX "Bookmark_animeId_idx" ON "Bookmark"("animeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_idx" ON "VerificationToken"("userId");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

-- CreateIndex
CREATE INDEX "ServerReview_animeSlug_idx" ON "ServerReview"("animeSlug");

-- CreateIndex
CREATE INDEX "ServerReview_userId_idx" ON "ServerReview"("userId");

-- CreateIndex
CREATE INDEX "ServerComment_animeSlug_episodeNumber_idx" ON "ServerComment"("animeSlug", "episodeNumber");

-- CreateIndex
CREATE INDEX "ServerComment_userId_idx" ON "ServerComment"("userId");

-- AddForeignKey
ALTER TABLE "AnimeRelation" ADD CONSTRAINT "AnimeRelation_fromAnimeId_fkey" FOREIGN KEY ("fromAnimeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeRelation" ADD CONSTRAINT "AnimeRelation_toAnimeId_fkey" FOREIGN KEY ("toAnimeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeCharacter" ADD CONSTRAINT "AnimeCharacter_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeCharacter" ADD CONSTRAINT "AnimeCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeStaff" ADD CONSTRAINT "AnimeStaff_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeStaff" ADD CONSTRAINT "AnimeStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeGenre" ADD CONSTRAINT "AnimeGenre_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeGenre" ADD CONSTRAINT "AnimeGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerReview" ADD CONSTRAINT "ServerReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerComment" ADD CONSTRAINT "ServerComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

