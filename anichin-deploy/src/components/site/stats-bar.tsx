'use client';

import { useQuery } from '@tanstack/react-query';
import { Film, Tv, Clock, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatViews } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

interface Stats {
  totalAnime: number;
  ongoing: number;
  completed: number;
  movies: number;
  totalEpisodes: number;
  trendingCount: number;
  totalViews: number;
}

export function StatsBar() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('stats');
      return res.json();
    },
    staleTime: 60_000,
  });

  const stats: Stats = data ?? {
    totalAnime: 0,
    ongoing: 0,
    completed: 0,
    movies: 0,
    totalEpisodes: 0,
    trendingCount: 0,
    totalViews: 0,
  };

  const cards: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent?: string; delay: number }[] = [
    { label: t('stats.totalAnime'), value: String(stats.totalAnime || '—'), icon: Film, accent: 'text-amber-400', delay: 0 },
    { label: t('stats.airing'), value: String(stats.ongoing || '—'), icon: Tv, accent: 'text-green-400', delay: 50 },
    { label: t('stats.totalEpisodes'), value: String(stats.totalEpisodes || '—'), icon: Clock, accent: 'text-cyan-400', delay: 100 },
    { label: t('stats.totalViews'), value: formatViews(stats.totalViews || 0), icon: Eye, accent: 'text-fuchsia-400', delay: 150 },
  ];

  return (
    <section className="border-y border-border/60 bg-gradient-to-r from-card/40 via-background to-card/40 backdrop-blur-sm">
      <div className="container-fluid py-4 grid grid-cols-2 sm:grid-cols-4 gap-responsive">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
              >
                <div className="h-11 w-11 rounded-lg shimmer" />
                <div className="space-y-1.5">
                  <div className="h-4 w-16 rounded shimmer" />
                  <div className="h-2.5 w-20 rounded shimmer" />
                </div>
              </div>
            ))
          : cards.map((s) => (
          <div
            key={s.label}
            className="group relative flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 hover:border-brand/40 hover:bg-brand/5 transition-all px-3 py-2 animate-fade-up overflow-hidden"
            style={{ animationDelay: `${s.delay}ms` }}
          >
            {/* Animated gradient bar on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-brand/0 via-brand/5 to-brand/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className={cn(
              'relative h-11 w-11 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110',
              'bg-gradient-to-br from-secondary/80 to-secondary/40 border border-border/60'
            )}>
              <s.icon className={cn('h-4 w-4', s.accent || 'text-muted-foreground')} />
            </div>
            <div className="min-w-0 relative">
              <div className="text-lg font-black leading-none tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5 truncate">
                {s.label}
              </div>
            </div>
          </div>
          ))
        }
      </div>
    </section>
  );
}
