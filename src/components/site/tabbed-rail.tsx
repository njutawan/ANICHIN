'use client';

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Radio, Star, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { AnimeCard } from './anime-card';
import { SectionHeading } from './latest-updates';
import { cn } from '@/lib/utils';
import type { AnimeCardData } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

type TabId = 'trending' | 'airing' | 'rated';

const TABS: { id: TabId; labelKey: string; subtitleKey: string; icon: typeof TrendingUp; url: string; pulse?: boolean }[] = [
  { id: 'trending', labelKey: 'section.trending', subtitleKey: 'section.subtitle.trending', icon: TrendingUp, url: '/api/anime?sort=views&limit=18' },
  { id: 'airing', labelKey: 'section.airing', subtitleKey: 'section.subtitle.airing', icon: Radio, url: '/api/anime?status=Ongoing&sort=latest&limit=18', pulse: true },
  { id: 'rated', labelKey: 'section.topRated', subtitleKey: 'section.subtitle.topRated', icon: Star, url: '/api/anime?sort=score&limit=18' },
];

/**
 * Tabbed Rail — merges Trending + TopAiring + TopRated into one tabbed section.
 * Reduces "row fatigue" by showing 1 row with 3 tabs instead of 3 separate rows.
 */
export function TabbedRail() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>('trending');
  const railRef = useRef<HTMLDivElement>(null);
  const currentTab = TABS.find((tb) => tb.id === activeTab)!;

  const { data, isLoading } = useQuery({
    queryKey: ['tabbed-rail', activeTab],
    queryFn: async () => {
      const res = await fetch(currentTab.url);
      if (!res.ok) throw new Error('tabbed-rail');
      return res.json();
    },
    staleTime: 60_000,
  });

  const animes: AnimeCardData[] = data?.animes ?? [];

  const scroll = (dir: 'left' | 'right') => {
    railRef.current?.scrollBy({ left: dir === 'left' ? -360 : 360, behavior: 'smooth' });
  };

  return (
    <section className="py-6">
      {/* Header with tabs */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div>
          <SectionHeading
            title={t('section.explore')}
            subtitle={t(currentTab.subtitleKey)}
            icon={Flame}
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full bg-secondary/60 border border-border/60 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
                aria-pressed={isActive}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(tab.labelKey)}
                {tab.pulse && (
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rail with cards */}
      <div className="relative group/rail">
        {/* Scroll arrows */}
        <button
          onClick={() => scroll('left')}
          aria-label={t('header.prevSlide')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full bg-background/80 backdrop-blur border border-border hover:bg-amber-500 hover:text-black transition-colors flex items-center justify-center opacity-0 group-hover/rail:opacity-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => scroll('right')}
          aria-label={t('header.nextSlide')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full bg-background/80 backdrop-blur border border-border hover:bg-amber-500 hover:text-black transition-colors flex items-center justify-center opacity-0 group-hover/rail:opacity-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Cards */}
        <div
          ref={railRef}
          className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 snap-x scroll-smooth"
        >
          {isLoading ? (
            // Skeleton
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-40 sm:w-44 lg:w-48 shrink-0 snap-start">
                <div className="aspect-[2/3] rounded-lg bg-secondary/40 animate-pulse" />
                <div className="h-3 bg-secondary/40 rounded mt-2 animate-pulse" />
              </div>
            ))
          ) : animes.length === 0 ? (
            <div className="w-full text-center py-12 border border-dashed border-border/60 rounded-lg">
              <p className="text-sm font-semibold">{t('empty.noCategory')}</p>
              <p className="text-xs text-foreground/60 mt-1">{t('empty.noCategoryDesc')}</p>
            </div>
          ) : (
            animes.map((a, i) => (
              <div key={a.id} className="w-40 sm:w-44 lg:w-48 shrink-0 snap-start">
                <AnimeCard anime={a} showRank={i + 1} />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
