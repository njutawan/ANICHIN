'use client';
import { useI18n } from '@/lib/i18n-context';

import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { EpisodeCard } from './anime-card';
import { SectionHeading } from './latest-updates';
import type { EpisodeData } from '@/lib/types';

export function NewEpisodesToday() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['today-episodes'],
    queryFn: async () => {
      const res = await fetch('/api/today');
      if (!res.ok) throw new Error('today');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const episodes: EpisodeData[] = data?.episodes ?? [];

  if (!isLoading && episodes.length === 0) return null;

  return (
    <section className="py-8 animate-fade-up">
      <SectionHeading
        title={t('section.todayEpisodes')}
        subtitle={`${episodes.length} episode baru dalam 24 jam terakhir`}
        icon={Flame}
      />

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden mt-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-40 shrink-0 space-y-2">
              <div className="aspect-[2/3] rounded-lg shimmer" />
              <div className="h-3 w-3/4 rounded shimmer" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mt-5">
          {episodes.slice(0, 12).map((ep) => (
            <EpisodeCard key={`${ep.anime.slug}-${ep.number}`} episode={ep} />
          ))}
        </div>
      )}
    </section>
  );
}
