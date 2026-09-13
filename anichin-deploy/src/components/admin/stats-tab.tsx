'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Film,
  PlayCircle,
  Eye,
  TrendingUp,
  CheckCircle2,
  Clapperboard,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Stats {
  totalAnime: number;
  ongoing: number;
  completed: number;
  movies: number;
  totalEpisodes: number;
  trendingCount: number;
  totalViews: number;
}

export function StatsTab() {
  const { data, isLoading, error } = useQuery<Stats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Gagal memuat statistik.');
      return res.json();
    },
  });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Gagal memuat statistik: {(error as Error).message}
      </div>
    );
  }

  const cards: { label: string; value: number; icon: LucideIcon; accent: string }[] = [
    {
      label: 'Total Anime',
      value: data?.totalAnime ?? 0,
      icon: Film,
      accent: 'text-amber-400',
    },
    {
      label: 'Sedang Tayang',
      value: data?.ongoing ?? 0,
      icon: Activity,
      accent: 'text-emerald-400',
    },
    {
      label: 'Tamat',
      value: data?.completed ?? 0,
      icon: CheckCircle2,
      accent: 'text-sky-400',
    },
    {
      label: 'Movie',
      value: data?.movies ?? 0,
      icon: Clapperboard,
      accent: 'text-violet-400',
    },
    {
      label: 'Total Episode',
      value: data?.totalEpisodes ?? 0,
      icon: PlayCircle,
      accent: 'text-rose-400',
    },
    {
      label: 'Trending',
      value: data?.trendingCount ?? 0,
      icon: TrendingUp,
      accent: 'text-orange-400',
    },
    {
      label: 'Total Tayangan',
      value: data?.totalViews ?? 0,
      icon: Eye,
      accent: 'text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card
            key={c.label}
            className="p-4 sm:p-5 gap-3 border-border/60 bg-card/60 hover:bg-card/80 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {isLoading ? (
                  <>
                    <Skeleton className="h-7 w-16 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-black tracking-tight tabular-nums">
                      {c.value.toLocaleString('id-ID')}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {c.label}
                    </div>
                  </>
                )}
              </div>
              <div
                className={`rounded-md bg-muted/60 p-2 ${c.accent}`}
                aria-hidden
              >
                <Icon className="size-5" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
