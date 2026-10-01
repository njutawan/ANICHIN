'use client';

import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import Link from 'next/link';
import { Flame, ChevronRight, ChevronLeft, Star, Calendar } from 'lucide-react';
import { AnimeCard } from './anime-card';
import { SectionHeading } from './latest-updates';
import { cn } from '@/lib/utils';
import type { AnimeCardData, GenreData } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

const GENRE_COLORS = [
  'from-rose-500/30 to-rose-500/5 border-rose-500/30 hover:border-rose-500/60',
  'from-amber-500/30 to-amber-500/5 border-amber-500/30 hover:border-amber-500/60',
  'from-emerald-500/30 to-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/60',
  'from-cyan-500/30 to-cyan-500/5 border-cyan-500/30 hover:border-cyan-500/60',
  'from-fuchsia-500/30 to-fuchsia-500/5 border-fuchsia-500/30 hover:border-fuchsia-500/60',
  'from-orange-500/30 to-orange-500/5 border-orange-500/30 hover:border-orange-500/60',
  'from-lime-500/30 to-lime-500/5 border-lime-500/30 hover:border-lime-500/60',
  'from-teal-500/30 to-teal-500/5 border-teal-500/30 hover:border-teal-500/60',
];

export function GenreGrid() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['genres-list'],
    queryFn: async () => {
      const res = await fetch('/api/genres');
      if (!res.ok) throw new Error('genres');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const genres: GenreData[] = (data?.genres ?? []).filter((g) => g.count > 0);

  return (
    <section id="genres" className="py-8 scroll-mt-24">
      <SectionHeading
        title={t('section.genres')}
        subtitle={t('section.subtitle.genre')}
        icon={Flame}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-responsive-sm mt-5">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-card animate-pulse" />
            ))
          : genres.slice(0, 18).map((g, i) => (
              <Link
                key={g.id}
                href="#list"
                className={cn(
                  'group relative overflow-hidden rounded-lg border bg-gradient-to-br p-3 transition-all hover:-translate-y-0.5',
                  GENRE_COLORS[i % GENRE_COLORS.length]
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm group-hover:text-white transition-colors">
                    {g.name}
                  </span>
                  <span className="text-xs text-muted-foreground bg-background/60 backdrop-blur rounded px-1.5 py-0.5">
                    {g.count}
                  </span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-white group-hover:translate-x-1 transition-all mt-2" />
              </Link>
            ))}
      </div>
    </section>
  );
}



export function TopRatedRail() {
  return (
    <Rail
      titleKey="section.topRated"
      subtitleKey="section.subtitle.topRatedShort"
      icon={Star}
      queryKey={['anime-rated']}
      fetchUrl="/api/anime?sort=score&limit=18"
    />
  );
}


export function UpcomingSeasonSection() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['anime-upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/anime?status=Upcoming&sort=score&limit=12');
      if (!res.ok) throw new Error('upcoming');
      return res.json();
    },
  });
  const animes: AnimeCardData[] = data?.animes ?? [];

  if (isLoading || animes.length === 0) return null;

  return (
    <section className="py-8">
      <SectionHeading
        title={t('section.upcoming')}
        subtitle={t('section.subtitle.upcoming')}
        icon={Calendar}
      />
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 mt-5 -mx-1 px-1 snap-x scroll-smooth">
        {animes.map((a, i) => (
          <div key={a.id} className="w-40 sm:w-44 lg:w-48 shrink-0 snap-start">
            <AnimeCard anime={a} showRank={i + 1} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Rail({
  titleKey,
  subtitleKey,
  icon: Icon,
  queryKey,
  fetchUrl,
  pulse,
}: {
  titleKey: string;
  subtitleKey: string;
  icon: React.ComponentType<{ className?: string }>;
  queryKey: unknown[];
  fetchUrl: string;
  pulse?: boolean;
}) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error('rail');
      return res.json();
    },
  });
  const animes: AnimeCardData[] = data?.animes ?? [];
  const railRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    railRef.current?.scrollBy({ left: dir === 'left' ? -360 : 360, behavior: 'smooth' });
  };

  return (
    <section className="py-8">
      <SectionHeading
        title={t(titleKey)}
        subtitle={t(subtitleKey)}
        icon={Icon}
        action={
          <div className="hidden sm:flex items-center gap-1.5">
            {pulse && (
              <span className="mr-2 flex items-center gap-1 text-xs text-brand font-bold uppercase tracking-wide">
                <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" /> Live
              </span>
            )}
            <button
              onClick={() => scroll('left')}
              aria-label={t('header.scrollLeft')}
              className="h-8 w-8 rounded-full border border-border bg-card/60 hover:bg-brand hover:text-brand-foreground hover:border-brand transition-colors flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              aria-label={t('header.scrollRight')}
              className="h-8 w-8 rounded-full border border-border bg-card/60 hover:bg-brand hover:text-brand-foreground hover:border-brand transition-colors flex items-center justify-center"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden mt-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-40 sm:w-48 shrink-0 space-y-2">
              <div className="aspect-[2/3] rounded-lg bg-card animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-card animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={railRef}
          className="flex gap-3 overflow-x-auto no-scrollbar pb-2 mt-5 -mx-1 px-1 snap-x scroll-smooth"
        >
          {animes.map((a, i) => (
            <div key={a.id} className="w-40 sm:w-44 lg:w-48 shrink-0 snap-start">
              <AnimeCard anime={a} showRank={i + 1} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
