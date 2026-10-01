'use client';

import { AnimeImage } from './anime-image';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
import { SectionHeading } from './latest-updates';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { AnimeCardData } from '@/lib/types';

const SEASONS = [
  { label: 'Winter 2024', year: 2024, season: 'Winter' },
  { label: 'Spring 2024', year: 2024, season: 'Spring' },
  { label: 'Summer 2024', year: 2024, season: 'Summer' },
  { label: 'Fall 2024', year: 2024, season: 'Fall' },
  { label: 'Winter 2025', year: 2025, season: 'Winter' },
  { label: 'Spring 2025', year: 2025, season: 'Spring' },
];

export function SeasonCalendar() {
  const openDetail = useUIStore((s) => s.openDetail);
  const { data, isLoading } = useQuery({
    queryKey: ['all-anime-seasons'],
    queryFn: async () => {
      const res = await fetch('/api/anime?limit=100&sort=latest');
      if (!res.ok) throw new Error('anime');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const allAnime: AnimeCardData[] = data?.animes ?? [];

  const bySeason: Record<string, AnimeCardData[]> = {};
  for (const a of allAnime) {
    if (!a.season || !a.releasedYear) continue;
    const key = `${a.season} ${a.releasedYear}`;
    if (!bySeason[key]) bySeason[key] = [];
    bySeason[key].push(a);
  }

  const seasonOrder = ['Winter', 'Spring', 'Summer', 'Fall'];
  const sortedSeasons = Object.entries(bySeason).sort((a, b) => {
    const [seasonA, yearA] = a[0].split(' ');
    const [seasonB, yearB] = b[0].split(' ');
    if (yearA !== yearB) return Number(yearA) - Number(yearB);
    return seasonOrder.indexOf(seasonA) - seasonOrder.indexOf(seasonB);
  });

  if (!isLoading && sortedSeasons.length === 0) return null;

  return (
    <section id="calendar" className="py-8 scroll-mt-24">
      <SectionHeading
        title="Kalender Musim"
        subtitle="Lihat anime per musim"
        icon={Calendar}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {SEASONS.slice(0, 4).map((_, i) => (
            <div key={i} className="h-40 rounded-xl shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {sortedSeasons.map(([seasonKey, animes]) => {
            const [season, year] = seasonKey.split(' ');
            const accentColors: Record<string, string> = {
              Winter: 'from-cyan-500/20 to-transparent border-cyan-500/30',
              Spring: 'from-green-500/20 to-transparent border-green-500/30',
              Summer: 'from-amber-500/20 to-transparent border-amber-500/30',
              Fall: 'from-orange-500/20 to-transparent border-orange-500/30',
            };
            const colorClass = accentColors[season] || accentColors.Fall;

            return (
              <div
                key={seasonKey}
                className={cn('rounded-xl border p-4 bg-gradient-to-br', colorClass)}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-lg font-black">
                    {season} <span className="text-brand">{year}</span>
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                    {animes.length} anime
                  </span>
                </div>

                {/* Horizontal scroll of posters */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {animes.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => openDetail(a.slug)}
                      className="group shrink-0 w-16 text-left"
                    >
                      <div className="relative aspect-[2/3] rounded overflow-hidden border border-border/60 group-hover:border-brand/60 transition-all">
                        <AnimeImage src={a.poster} alt={a.title} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-0 inset-x-0 p-1">
                          <div className="text-[8px] font-semibold text-white line-clamp-2 leading-tight">
                            {a.title}
                          </div>
                        </div>
                      </div>
                      <div className="text-[8px] text-brand font-bold mt-0.5 text-center">
                        {a.score.toFixed(1)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
