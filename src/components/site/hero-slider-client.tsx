'use client';

import Image from 'next/image';
import { AnimeImage } from './anime-image';
import { useState, useEffect, useCallback } from 'react';
import { Play, Star, Calendar, Clock, ChevronLeft, ChevronRight, Info, Bookmark, BookmarkCheck } from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatViews, type AnimeCardData } from '@/lib/types';

function Flame() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 mr-1 fill-current" aria-hidden>
      <path d="M12 2c1 3 4 4 4 8a4 4 0 11-8 0c0-2 1-3 1-3s1 2 3 2c0-2-1-4 0-7z" />
    </svg>
  );
}

interface HeroSliderClientProps {
  slides: AnimeCardData[];
}

export function HeroSliderClient({ slides }: HeroSliderClientProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const autoplayHero = useUIStore((s) => s.autoplayHero);
  const openDetail = useUIStore((s) => s.openDetail);

  const next = useCallback(() => {
    setIndex((i) => (slides.length ? (i + 1) % slides.length : 0));
  }, [slides.length]);
  const prev = useCallback(() => {
    setIndex((i) => (slides.length ? (i - 1 + slides.length) % slides.length : 0));
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length === 0 || !autoplayHero) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [paused, next, slides.length, autoplayHero]);

  const safeIndex = slides.length > 0 ? index % slides.length : 0;
  const current = slides[safeIndex];

  return (
    <section
      id="home"
      className="relative w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative hero-fluid">
        {slides.map((slide, i) => (
          <Slide
            key={slide.id}
            anime={slide}
            active={i === safeIndex}
            isLCP={i === 0}
          />
        ))}

        {/* Gradient overlays */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/80 via-background/20 to-transparent" />

        {/* Navigation arrows */}
        <button
          onClick={prev}
          aria-label="Sebelumnya"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full bg-background/60 backdrop-blur border border-border hover:bg-amber-500 hover:text-black transition-colors flex items-center justify-center"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={next}
          aria-label="Berikutnya"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full bg-background/60 backdrop-blur border border-border hover:bg-amber-500 hover:text-black transition-colors flex items-center justify-center"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === safeIndex ? 'w-8 bg-amber-400' : 'w-2.5 bg-foreground/40 hover:bg-foreground/60'
              )}
            />
          ))}
        </div>

        {/* Active slide content — H1 is rendered here in SSR */}
        <SlideContent anime={current} onOpen={() => openDetail(current.slug)} />
      </div>
    </section>
  );
}

function Slide({ anime, active, isLCP }: { anime: AnimeCardData; active: boolean; isLCP?: boolean }) {
  return (
    <div
      className={cn(
        'absolute inset-0 transition-opacity duration-700',
        active ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
    >
      <Image
        src={anime.banner || anime.poster}
        alt={anime.title}
        fill
        priority={isLCP}
        sizes="100vw"
        className="h-full w-full object-cover scale-105"
        style={{
          transform: active ? 'scale(1.05)' : 'scale(1.12)',
          transition: 'transform 7s ease-out',
        }}
      />
    </div>
  );
}

function SlideContent({ anime, onOpen }: { anime: AnimeCardData; onOpen: () => void }) {
  const openWatch = useUIStore((s) => s.openWatch);
  const toggleBookmark = useUIStore((s) => s.toggleBookmark);
  const rawBookmarked = useUIStore((s) => s.bookmarks.some((b) => b.slug === anime.slug));
  const mounted = useMounted();
  const isBookmarked = mounted && rawBookmarked;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20">
      <div className="container-fluid pb-10 lg:pb-16">
        <div className="flex flex-col lg:flex-row gap-6 lg:items-end">
          {/* Poster (desktop) */}
          <div className="hidden lg:block shrink-0">
            <div className="relative w-44 h-64 rounded-lg overflow-hidden border border-border/60 shadow-2xl shadow-black/60 group">
              <AnimeImage src={anime.poster} alt={anime.title} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute top-2 left-2">
                <Badge className="bg-black/80 text-amber-400 border-0 text-xs font-bold">
                  #{anime.rank ?? '—'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Text content */}
          <div className="flex-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 font-semibold">
                <Flame /> Featured
              </Badge>
              <Badge variant="outline" className="border-border/60 text-foreground/80">
                {anime.type}
              </Badge>
              <Badge variant="outline" className="border-border/60 text-foreground/80">
                {anime.status}
              </Badge>
              {anime.studio && (
                <span className="text-xs text-foreground/70">Studio: {anime.studio}</span>
              )}
            </div>

            {/* H1 — rendered in SSR (Google can read without JS) */}
            <h1 className="text-fluid-2xl font-black tracking-tight leading-tight mb-1 text-balance">
              {anime.title}
            </h1>
            {anime.titleJp && (
              <p className="text-amber-400 text-sm sm:text-base font-medium mb-3">{anime.titleJp}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 mb-3 text-sm text-foreground/70">
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <Star className="h-4 w-4 fill-amber-400" />
                {anime.score.toFixed(1)}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {anime.releasedYear} · {anime.season}
              </span>
              {anime.duration && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {anime.duration}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Play className="h-4 w-4" />
                EP {anime.releasedEpisodes ?? 0}/{anime.totalEpisodes ?? '?'}
              </span>
              <span className="text-foreground/70">· {formatViews(anime.views)} views</span>
            </div>

            <p className="text-sm sm:text-base text-foreground/70 line-clamp-3 mb-4 max-w-xl">
              {anime.synopsis}
            </p>

            <div className="flex flex-wrap gap-1.5 mb-5">
              {anime.genres.slice(0, 5).map((g) => (
                <span
                  key={g}
                  className="text-xs px-2 py-0.5 rounded-full bg-secondary/70 border border-border/60 text-foreground/70"
                >
                  {g}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => openWatch(anime.slug, 1)}
                size="lg"
                className="bg-amber-500 text-black hover:bg-amber-400 font-bold"
              >
                <Play className="h-4 w-4 mr-1 fill-black" /> Tonton Sekarang
              </Button>
              <Button
                onClick={onOpen}
                size="lg"
                variant="outline"
                className="border-border bg-background/40 backdrop-blur hover:bg-secondary"
              >
                <Info className="h-4 w-4 mr-1" /> Detail
              </Button>
              <Button
                onClick={() => toggleBookmark({ slug: anime.slug, title: anime.title, poster: anime.poster, addedAt: Date.now() })}
                size="lg"
                variant="ghost"
                className={cn(
                  'text-foreground/70 hover:text-amber-400',
                  isBookmarked && 'text-amber-400 bg-amber-500/10'
                )}
                aria-label={isBookmarked ? 'Hapus bookmark' : 'Tambah bookmark'}
              >
                {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
