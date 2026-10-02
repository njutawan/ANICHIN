'use client';

import { AnimeImage } from './anime-image';
import { useQuery } from '@tanstack/react-query';
import { Quote, ChevronRight } from 'lucide-react';
import { SectionHeading } from './latest-updates';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import type { AnimeCardData } from '@/lib/types';
import { Star } from 'lucide-react';
import { EDITORIAL_PICKS, EDITORIAL_SLUGS } from '@/lib/editorial';
import { animeListUrl, HOME_QUERY_PARAMS, homeQueryKeys } from '@/lib/queries/home';

export function EditorsChoice() {
  const openDetail = useUIStore((s) => s.openDetail);
  const { data, isLoading } = useQuery({
    queryKey: homeQueryKeys.editorialPicks,
    queryFn: async () => {
      const res = await fetch(animeListUrl({ ...HOME_QUERY_PARAMS.editorialPicks, slugs: EDITORIAL_SLUGS }));
      if (!res.ok) throw new Error('editorial');
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  const animes: AnimeCardData[] = data?.animes ?? [];

  if (!isLoading && animes.length === 0) return null;

  return (
    <section className="py-8">
      <SectionHeading
        title="Pilihan Editor"
        subtitle="Tim redaksi pilih buat kamu"
        icon={Quote}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {animes.map((anime, i) => {
            const editorial = EDITORIAL_PICKS.find((e) => e.slug === anime.slug) ?? EDITORIAL_PICKS[0];
            return (
              <button
                key={anime.id}
                onClick={() => openDetail(anime.slug)}
                className={cn(
                  'group relative flex gap-4 p-4 rounded-xl border bg-gradient-to-br hover:border-brand/40 transition-all text-left overflow-hidden',
                  editorial.accent
                )}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* Poster */}
                <div className="relative shrink-0 w-20 sm:w-24 aspect-[2/3] rounded-lg overflow-hidden border border-border/60">
                  <AnimeImage src={anime.poster} alt={anime.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 flex flex-col">
                  {/* Quote */}
                  <div className="flex-1">
                    <Quote className="h-4 w-4 text-brand/40 mb-1 shrink-0" />
                    <p className="text-xs sm:text-sm text-foreground/80 italic leading-relaxed line-clamp-3">
                      "{editorial.quote}"
                    </p>
                  </div>

                  {/* Author + Anime */}
                  <div className="mt-2 pt-2 border-t border-border/40">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center text-brand-foreground text-xs font-bold shrink-0">
                        {editorial.author.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{editorial.author}</div>
                        <div className="text-xs text-muted-foreground">{editorial.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-xs font-bold truncate group-hover:text-brand transition-colors">{anime.title}</span>
                      <span className="flex items-center gap-0.5 text-xs text-brand font-semibold shrink-0">
                        <Star className="h-2.5 w-2.5 fill-brand" />{anime.score.toFixed(1)}
                      </span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
