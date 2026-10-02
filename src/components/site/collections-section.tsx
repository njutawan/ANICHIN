'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { homeQueryKeys } from '@/lib/queries/home';
import {
  Trophy, Flame, Gem, Castle, Heart, Bot, Sparkles,
} from 'lucide-react';
import { AnimeCard } from './anime-card';
import { SectionHeading } from './latest-updates';
import { cn } from '@/lib/utils';
import type { AnimeCardData } from '@/lib/types';

interface CollectionItem {
  slug: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  count: number;
  animes: AnimeCardData[];
}

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  trophy: Trophy,
  flame: Flame,
  gem: Gem,
  castle: Castle,
  heart: Heart,
  robot: Bot,
};

export function CollectionsSection() {
  const [activeIdx, setActiveIdx] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: homeQueryKeys.collections,
    queryFn: async () => {
      const res = await fetch('/api/collections');
      if (!res.ok) throw new Error('collections');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const collections: CollectionItem[] = data?.collections ?? [];
  const active = collections[activeIdx];

  return (
    <section id="collections" className="py-8 scroll-mt-24">
      <SectionHeading
        title="Koleksi Pilihan"
        subtitle="Kurasi tematik dari tim AniChin"
        icon={Sparkles}
      />

      {/* Collection tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mt-5 -mx-1 px-1">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 w-40 rounded-full shimmer shrink-0" />
            ))
          : collections.map((c, i) => {
              const Icon = ICONS[c.icon] ?? Sparkles;
              return (
                <button
                  key={c.slug}
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all shrink-0',
                    'animate-fade-up',
                    i === activeIdx
                      ? 'text-white border-transparent shadow-lg'
                      : 'bg-secondary/50 text-muted-foreground border-border/60 hover:bg-secondary hover:text-foreground'
                  )}
                  style={i === activeIdx ? { backgroundColor: c.accent, boxShadow: `0 4px 14px -2px ${c.accent}80` } : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {c.title}
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    i === activeIdx ? 'bg-black/20' : 'bg-secondary'
                  )}>
                    {c.count}
                  </span>
                </button>
              );
            })}
      </div>

      {/* Active collection content */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mt-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[2/3] rounded-lg shimmer" />
              <div className="h-3 w-3/4 rounded shimmer" />
            </div>
          ))}
        </div>
      ) : active ? (
        <div className="mt-5 animate-fade-up">
          {/* Collection header */}
          <div
            className="rounded-xl border p-4 mb-4 relative overflow-hidden"
            style={{
              borderColor: `${active.accent}40`,
              background: `linear-gradient(135deg, ${active.accent}18, transparent)`,
            }}
          >
            <div
              className="absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl opacity-30"
              style={{ backgroundColor: active.accent }}
            />
            <div className="relative flex items-center gap-3">
              <div
                className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${active.accent}30` }}
              >
                {(() => {
                  const Icon = ICONS[active.icon] ?? Sparkles;
                  return <Icon className="h-5 w-5" style={{ color: active.accent }} />;
                })()}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-black flex items-center gap-2">
                  {active.title}
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: `${active.accent}30`, color: active.accent }}>
                    {active.count} anime
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{active.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Anime grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {active.animes.map((a, i) => (
              <AnimeCard key={a.id} anime={a} showRank={i + 1} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
