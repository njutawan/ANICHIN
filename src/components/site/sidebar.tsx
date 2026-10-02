'use client';

import { AnimeImage } from './anime-image';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Eye, ChevronRight, Trophy, Flame } from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatViews, DAY_ORDER } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/lib/i18n-context';
import { homeQueryKeys } from '@/lib/queries/home';
import type { PopularPayload, SchedulePayload } from '@/lib/types';

type PopularItem = PopularPayload['popular'][number];

/**
 * Sidebar beranda. `initialPopular`/`initialSchedule` diisi RSC supaya isi
 * ranking & jadwal sudah ada di HTML (sticky sidebar terlihat di layar besar
 * sebelum JS selesai dimuat).
 */
export function Sidebar({
  initialPopular,
  initialSchedule,
}: { initialPopular?: PopularPayload; initialSchedule?: SchedulePayload } = {}) {
  return (
    <aside className="space-y-6">
      <PopularRanking initialData={initialPopular} />
      <ScheduleCard initialData={initialSchedule} />
      <DiscordCard />
    </aside>
  );
}

function PopularRanking({ initialData }: { initialData?: PopularPayload } = {}) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: homeQueryKeys.popular,
    queryFn: async () => {
      const res = await fetch('/api/popular');
      if (!res.ok) throw new Error('popular');
      return res.json();
    },
    initialData,
  });
  const items: PopularItem[] = data?.popular ?? [];
  const openDetail = useUIStore((s) => s.openDetail);

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-brand/15 to-transparent border-b border-border/60">
        <Trophy className="h-4 w-4 text-brand" />
        <h3 className="font-bold text-sm">{t('section.popularTop')}</h3>
        <Badge variant="secondary" className="ml-auto text-xs bg-brand/20 text-brand border-brand/30">
          {t('common.animeCount').replace('{n}', String(items.length))}
        </Badge>
      </div>
      <ScrollArea className="h-[460px]">
        <div className="p-2 space-y-1">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-2 p-2 animate-pulse">
                  <div className="h-14 w-10 rounded bg-secondary" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 rounded bg-secondary" />
                    <div className="h-2.5 w-1/2 rounded bg-secondary" />
                  </div>
                </div>
              ))
            : items.map((item) => (
                <button
                  key={item.slug}
                  onClick={() => openDetail(item.slug)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/60 transition-colors text-left group"
                >
                  <span
                    className={cn(
                      'shrink-0 w-6 text-center font-black text-sm',
                      item.rank === 1 && 'text-brand',
                      item.rank === 2 && 'text-amber-400',
                      item.rank === 3 && 'text-orange-400',
                      (item.rank ?? 0) > 3 && 'text-muted-foreground'
                    )}
                  >
                    {item.rank}
                  </span>
                  <div className="relative shrink-0">
                      <AnimeImage src={item.poster}
                      alt={item.title}
                      className="h-16 w-11 rounded object-cover border border-border/60 group-hover:border-brand/60 transition-colors"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold leading-tight line-clamp-2 group-hover:text-brand transition-colors">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5 text-brand font-semibold">
                        ⭐ {item.score.toFixed(1)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Eye className="h-2.5 w-2.5" /> {formatViews(item.views ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge className="text-xs px-1 py-0 bg-secondary border-0 text-muted-foreground">
                        {item.type}
                      </Badge>
                      {item.status === 'Ongoing' && (
                        <Badge className="text-xs px-1 py-0 bg-green-500/20 text-green-400 border-0">
                          ● {t('common.ongoing')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-brand transition-colors shrink-0" />
                </button>
              ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ScheduleCard({ initialData }: { initialData?: SchedulePayload } = {}) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: homeQueryKeys.schedule,
    queryFn: async () => {
      const res = await fetch('/api/schedule');
      if (!res.ok) throw new Error('schedule');
      return res.json();
    },
    initialData,
  });
  const [activeDay, setActiveDay] = useState<string>(() => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    return DAY_ORDER.includes(today) ? today : 'Monday';
  });

  const schedule: Record<string, PopularItem[]> = data?.schedule ?? {};
  const todays = schedule[activeDay] ?? [];
  const openDetail = useUIStore((s) => s.openDetail);

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-brand/15 to-transparent border-b border-border/60">
        <CalendarDays className="h-4 w-4 text-brand" />
        <h3 className="font-bold text-sm">{t('section.schedule')}</h3>
      </div>
      <div className="p-2">
        <div className="flex flex-wrap gap-1 mb-2">
          {DAY_ORDER.map((d) => (
            <button
              key={d}
              onClick={() => setActiveDay(d)}
              className={cn(
                'px-2 py-1 rounded text-xs font-medium transition-colors',
                activeDay === d
                  ? 'bg-brand text-brand-foreground'
                  : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              {t(`day.${d}`)}
            </button>
          ))}
        </div>
        <ScrollArea className="h-[280px]">
          <div className="space-y-1 pr-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-2 p-1.5 animate-pulse">
                  <div className="h-12 w-9 rounded bg-secondary" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-3/4 rounded bg-secondary" />
                    <div className="h-2 w-1/3 rounded bg-secondary" />
                  </div>
                </div>
              ))
            ) : todays.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                {t('empty.noSchedule')}
              </div>
            ) : (
              todays.map((item) => (
                <button
                  key={item.slug}
                  onClick={() => openDetail(item.slug)}
                  className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-secondary/60 transition-colors text-left group"
                >
                    <AnimeImage src={item.poster}
                    alt={item.title}
                    className="h-12 w-9 rounded object-cover border border-border/60 group-hover:border-brand/60 transition-colors"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold leading-tight line-clamp-1 group-hover:text-brand transition-colors">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                      <span className="text-brand font-semibold">⭐ {item.score.toFixed(1)}</span>
                      <span>·</span>
                      <span>EP {item.releasedEpisodes ?? 0}/{item.totalEpisodes ?? '?'}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function DiscordCard() {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-brand/30 bg-gradient-to-br from-brand/15 via-card/50 to-card p-4 overflow-hidden relative">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand/20 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center">
            <Flame className="h-4 w-4 text-brand-foreground" />
          </div>
          <h3 className="font-bold text-sm">{t('section.joinCommunity')}</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {t('section.discordDesc')}
        </p>
        <button className="w-full bg-brand text-brand-foreground hover:bg-brand/90 transition-colors rounded-md py-2 text-xs font-bold">
          {t('section.joinNow')}
        </button>
      </div>
    </div>
  );
}
