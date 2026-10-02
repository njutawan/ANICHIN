import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { Star, Eye, Calendar, Clock, Building2, ChevronRight, Bookmark } from 'lucide-react';
import { db } from '@/lib/db';
import {
  buildAnimeMetadata,
  buildAnimeCreativeWork,
  buildAnimeBreadcrumb,
  type AnimeSeoInput,
} from '@/lib/anime-seo';
import { sanitizeForJSONLD } from '@/lib/security';
import { formatViews, timeAgo } from '@/lib/types';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';
import { BottomNav } from '@/components/site/bottom-nav';
import { AnimeImage } from '@/components/site/anime-image';
import { AnimePageActions } from '@/components/site/anime-page-actions';
import { AnimeEpisodeList } from '@/components/site/anime-episode-list';
import { LazyModals } from '@/components/site/modal-lazy';

/**
 * Halaman detail anime — route KANONIK yang bisa diindeks mesin pencari.
 *
 * Sebelumnya detail anime hanya modal client-side di `/?anime=<slug>` sehingga
 * tidak ada satu pun halaman anime yang bisa ranking. Halaman ini
 * server-rendered: judul, sinopsis, daftar episode, ulasan, dan JSON-LD
 * semuanya ada di HTML awal (tanpa JS).
 *
 * `dynamic = 'force-dynamic'` diwarisi dari root layout (nonce CSP per request).
 */

const SLUG_RE = /^[a-z0-9-]+$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug) || slug.length > 200) return { title: 'Anime tidak ditemukan' };

  const anime = await db.anime.findUnique({
    where: { slug },
    select: {
      slug: true, title: true, titleEn: true, titleJp: true, synopsis: true,
      poster: true, banner: true, score: true, type: true, status: true,
      studio: true, releasedYear: true, rating: true,
      genres: { select: { genre: { select: { name: true } } } },
    },
  });

  if (!anime) return { title: 'Anime tidak ditemukan' };

  return buildAnimeMetadata({
    ...anime,
    genres: anime.genres.map((g) => g.genre.name),
  });
}

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Validasi slug (konsisten dengan /api/anime/[slug]) — cegah slug aneh/panjang.
  if (!SLUG_RE.test(slug) || slug.length > 200) notFound();

  const anime = await db.anime.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, titleEn: true, titleJp: true, alternativeTitle: true,
      synopsis: true, poster: true, banner: true, type: true, status: true, studio: true,
      source: true, releasedYear: true, season: true, score: true, rating: true, views: true,
      duration: true, airedDay: true, trailer: true, totalEpisodes: true, releasedEpisodes: true,
      genres: { select: { genre: { select: { name: true, slug: true } } } },
      episodes: {
        select: { id: true, number: true, title: true, duration: true, releasedAt: true, views: true },
        orderBy: { number: 'asc' },
      },
    },
  });

  if (!anime) notFound();

  const [reviewCount, reviews] = await Promise.all([
    db.serverReview.count({ where: { animeSlug: slug } }),
    db.serverReview.findMany({
      where: { animeSlug: slug },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true, rating: true, comment: true, createdAt: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  const genreNames = anime.genres.map((g) => g.genre.name);
  const seoInput: AnimeSeoInput = { ...anime, genres: genreNames };

  // Nonce dari proxy.ts → JSON-LD inline ikut diizinkan CSP produksi
  // ('strict-dynamic' memblokir script tanpa nonce).
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  const creativeWork = buildAnimeCreativeWork(seoInput, reviews, reviewCount);
  const breadcrumb = buildAnimeBreadcrumb(anime);

  const meta = [
    anime.type,
    anime.status,
    anime.releasedYear ? String(anime.releasedYear) : null,
    anime.season ? `${anime.season} ${anime.releasedYear ?? ''}`.trim() : null,
    anime.duration,
    anime.rating,
  ].filter(Boolean) as string[];

  const firstEpisode = anime.episodes[0]?.number ?? null;
  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : anime.score;

  return (
    <div className="flex min-h-dvh flex-col bg-background overflow-x-hidden max-w-[100vw]">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: sanitizeForJSONLD(JSON.stringify(creativeWork)) }}
      />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: sanitizeForJSONLD(JSON.stringify(breadcrumb)) }}
      />

      <Header />

      <main id="main-content" className="flex-1">
        {/* Banner */}
        <div className="relative h-44 sm:h-64 w-full overflow-hidden">
          <AnimeImage
            src={anime.banner || anime.poster}
            alt={anime.title}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        <div className="container-fluid -mt-20 sm:-mt-24 relative z-10 pb-10">
          {/* Breadcrumb (juga ada di JSON-LD) */}
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              <li>
                <Link href="/" className="hover:text-brand transition-colors">Beranda</Link>
              </li>
              <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
              <li>
                <Link href="/#list" className="hover:text-brand transition-colors">Anime List</Link>
              </li>
              <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
              <li className="text-foreground font-medium truncate max-w-[60vw]">{anime.title}</li>
            </ol>
          </nav>

          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
            {/* Poster */}
            <div className="w-32 sm:w-44 md:w-full shrink-0">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-border/60 shadow-2xl bg-card">
                <AnimeImage
                  src={anime.poster}
                  alt={anime.title}
                  fill
                  priority
                  sizes="(max-width: 768px) 40vw, 220px"
                  className="object-cover"
                />
              </div>
              <div className="mt-3 hidden md:flex items-center gap-2 text-xs text-muted-foreground">
                <Bookmark className="h-3.5 w-3.5" />
                <span>Simpan untuk ditonton nanti</span>
              </div>
            </div>

            {/* Info utama */}
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{anime.title}</h1>
              {(anime.titleJp || anime.titleEn) && (
                <p className="text-sm text-muted-foreground mt-1">
                  {[anime.titleJp, anime.titleEn].filter(Boolean).join(' · ')}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 text-amber-400 px-2 py-1 text-xs font-bold">
                  <Star className="h-3.5 w-3.5 fill-current" /> {anime.score.toFixed(1)}
                </span>
                {meta.map((m) => (
                  <span key={m} className="rounded-md bg-card/80 border border-border/60 px-2 py-1 text-xs">
                    {m}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 rounded-md bg-card/80 border border-border/60 px-2 py-1 text-xs">
                  <Eye className="h-3.5 w-3.5" /> {formatViews(anime.views)}
                </span>
              </div>

              {/* Genre — link ke daftar anime per genre (internal linking) */}
              {anime.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {anime.genres.map((g) => (
                    <Link
                      key={g.genre.slug}
                      href={`/?genre=${g.genre.slug}#list`}
                      className="rounded-full border border-border/60 px-2.5 py-1 text-xs hover:border-brand/60 hover:text-brand transition-colors"
                    >
                      {g.genre.name}
                    </Link>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <AnimePageActions
                  slug={anime.slug}
                  title={anime.title}
                  poster={anime.poster}
                  firstEpisode={firstEpisode}
                />
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 text-xs">
                {anime.studio && (
                  <div>
                    <dt className="text-muted-foreground inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Studio
                    </dt>
                    <dd className="font-medium mt-0.5">{anime.studio}</dd>
                  </div>
                )}
                {anime.airedDay && (
                  <div>
                    <dt className="text-muted-foreground inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Jadwal
                    </dt>
                    <dd className="font-medium mt-0.5">Setiap {anime.airedDay}</dd>
                  </div>
                )}
                {(anime.totalEpisodes || anime.releasedEpisodes) && (
                  <div>
                    <dt className="text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Episode
                    </dt>
                    <dd className="font-medium mt-0.5">
                      {anime.releasedEpisodes ?? anime.episodes.length}
                      {anime.totalEpisodes ? ` / ${anime.totalEpisodes}` : ''}
                    </dd>
                  </div>
                )}
                {anime.source && (
                  <div>
                    <dt className="text-muted-foreground">Sumber</dt>
                    <dd className="font-medium mt-0.5">{anime.source}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Sinopsis */}
          <section className="mt-8">
            <h2 className="text-lg font-bold mb-2">Sinopsis {anime.title}</h2>
            <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line">
              {anime.synopsis}
            </p>
          </section>

          {/* Trailer */}
          {anime.trailer && (
            <section className="mt-6">
              <h2 className="text-lg font-bold mb-2">Trailer</h2>
              <a
                href={anime.trailer}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-sm text-brand hover:underline"
              >
                Tonton trailer di sini
              </a>
            </section>
          )}

          {/* Episode */}
          <section className="mt-8">
            <h2 className="text-lg font-bold mb-2">
              Daftar Episode {anime.title}
              {anime.totalEpisodes ? ` (${anime.totalEpisodes} Episode)` : ''}
            </h2>
            <AnimeEpisodeList slug={anime.slug} episodes={anime.episodes} />
          </section>

          {/* Ulasan */}
          <section className="mt-8">
            <h2 className="text-lg font-bold mb-2">
              Ulasan Pengguna {reviewCount > 0 ? `(${reviewCount})` : ''}
            </h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada ulasan. Buka detail di aplikasi untuk menulis ulasan pertama.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  Rata-rata rating ulasan: <strong className="text-foreground">{avgRating.toFixed(1)}/10</strong>
                </p>
                <ul className="space-y-3">
                  {reviews.map((r) => (
                    <li key={r.id} className="rounded-lg border border-border/60 bg-card/40 p-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold">{r.user?.name || 'Anonim'}</span>
                        <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                          <Star className="h-3 w-3 fill-current" /> {r.rating}/10
                        </span>
                        <span className="text-muted-foreground">{timeAgo(r.createdAt)}</span>
                      </div>
                      <p className="text-sm text-foreground/85 mt-1.5 whitespace-pre-wrap">{r.comment}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Internal linking balik ke katalog */}
          <nav className="mt-8 text-sm">
            <Link href="/#list" className="text-brand hover:underline">
              ← Lihat semua anime
            </Link>
            <span className="mx-2 text-muted-foreground">·</span>
            <Link href="/#schedule" className="text-brand hover:underline">
              Jadwal rilis harian
            </Link>
          </nav>
        </div>
      </main>

      <Footer />
      <BottomNav />

      {/*
        Modal player + komentar. Sebelumnya hanya dipasang di beranda, sehingga
        tombol "Tonton Sekarang" di halaman ini mengubah state store tanpa ada
        yang merender modalnya (player & komentar tidak pernah terbuka).
      */}
      <LazyModals />
    </div>
  );
}
