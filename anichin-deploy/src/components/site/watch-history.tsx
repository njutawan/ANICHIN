'use client';
import { useI18n } from '@/lib/i18n-context';

import { AnimeImage } from './anime-image';
import { useUIStore } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { History, Clock, Trash2, Play, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeading } from './latest-updates';
import { timeAgo } from '@/lib/types';

interface CWItem {
  slug: string;
  title: string;
  poster: string;
  episodeNumber: number;
  totalEpisodes?: number;
  watchedAt: number;
  progress: number;
}

export function WatchHistory() {
  const { t } = useI18n();
  const mounted = useMounted();
  const items = useUIStore((s) => s.continueWatching);
  const clearHistory = useUIStore((s) => s.clearContinueWatching);
  const openWatch = useUIStore((s) => s.openWatch);

  if (!mounted || items.length === 0) return null;

  // Group by day
  const groups: Record<string, CWItem[]> = {};
  for (const item of items) {
    const d = new Date(item.watchedAt);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = 'Hari Ini';
    else if (d.toDateString() === yesterday.toDateString()) label = 'Kemarin';
    else label = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }

  return (
    <section id="history" className="py-8 scroll-mt-24 animate-fade-up">
      <SectionHeading
        title={t("section.watchHistory")}
        subtitle="Semua episode yang pernah kamu tonton"
        icon={History}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Bersihkan
          </Button>
        }
      />

      <div className="mt-5 space-y-6">
        {Object.entries(groups).map(([label, group]) => (
          <div key={label}>
            {/* Day header */}
            <div className="flex items-center gap-2 mb-3 sticky top-20 z-10 bg-background/80 backdrop-blur-sm py-1.5">
              <Calendar className="h-3.5 w-3.5 text-brand" />
              <span className="text-sm font-bold">{label}</span>
              <span className="text-xs text-muted-foreground">({group.length} episode)</span>
              <div className="flex-1 h-px bg-border/40 ml-2" />
            </div>

            {/* Timeline items */}
            <div className="relative pl-6 border-l border-border/60 space-y-3">
              {group.map((item) => (
                <div
                  key={`${item.slug}-${item.episodeNumber}`}
                  className="relative group"
                >
                  {/* Timeline dot */}
                  <div
                    className="absolute -left-[27px] top-4 h-3 w-3 rounded-full border-2 border-background bg-brand"
                    style={{
                      boxShadow: '0 0 0 2px var(--brand)',
                    }}
                  />

                  <button
                    onClick={() => openWatch(item.slug, item.episodeNumber)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-card/40 hover:border-brand/40 hover:bg-brand/5 transition-all text-left group"
                  >
                    {/* Poster */}
                    <div className="relative shrink-0 h-14 w-24 rounded overflow-hidden">
                      <AnimeImage src={item.poster} alt={item.title} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Play className="h-5 w-5 text-brand fill-brand" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold line-clamp-1 group-hover:text-brand transition-colors">
                          {item.title}
                        </h4>
                        <Badge className="bg-brand/20 text-brand border-0 text-xs font-bold">
                          EP {item.episodeNumber}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> {timeAgo(item.watchedAt)}
                        </span>
                        {item.totalEpisodes && (
                          <span>· {item.episodeNumber}/{item.totalEpisodes} ep</span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full progress-shimmer"
                          style={{ width: `${Math.max(5, Math.min(100, item.progress))}%` }}
                        />
                      </div>
                    </div>

                    {/* Progress % */}
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-brand">{Math.round(item.progress)}%</div>
                      <div className="text-xs text-muted-foreground">selesai</div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
