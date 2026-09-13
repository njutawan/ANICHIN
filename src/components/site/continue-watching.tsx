'use client';

import { AnimeImage } from './anime-image';
import { useUIStore } from '@/lib/store';
import { Play, Clock, X, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeading } from './latest-updates';
import { timeAgo } from '@/lib/types';
import { useMounted } from '@/hooks/use-mounted';
import { useI18n } from '@/lib/i18n-context';

interface CWItem {
  slug: string;
  title: string;
  poster: string;
  episodeNumber: number;
  totalEpisodes?: number;
  watchedAt: number;
  progress: number;
}

export function ContinueWatching() {
  const { t } = useI18n();
  const mounted = useMounted();
  const items = useUIStore((s) => s.continueWatching);
  const clearContinueWatching = useUIStore((s) => s.clearContinueWatching);
  const openWatch = useUIStore((s) => s.openWatch);

  if (!mounted || items.length === 0) return null;

  return (
    <section className="py-8 animate-fade-up">
      <SectionHeading
        title={t('section.continueWatching')}
        subtitle={t('continue.subtitle')}
        icon={History}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={clearContinueWatching}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5 mr-1" /> {t('continue.clear')}
          </Button>
        }
      />
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 mt-5 -mx-1 px-1 snap-x scroll-smooth">
        {items.slice(0, 10).map((item) => (
          <ContinueCard key={item.slug} item={item} onPlay={() => openWatch(item.slug, item.episodeNumber)} />
        ))}
      </div>
    </section>
  );
}

function ContinueCard({ item, onPlay }: { item: CWItem; onPlay: () => void }) {
  const { t } = useI18n();
  return (
    <article
      className="group cursor-pointer w-72 sm:w-80 shrink-0 snap-start"
      onClick={onPlay}
    >
      <div className="relative aspect-video rounded-lg overflow-hidden border border-border/60 bg-card transition-all duration-300 group-hover:border-brand/60 group-hover:shadow-xl group-hover:shadow-brand/10">
        <AnimeImage src={item.poster}
          alt={item.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-90 group-hover:opacity-100" />

        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="h-14 w-14 rounded-full bg-brand/90 backdrop-blur flex items-center justify-center scale-50 group-hover:scale-100 transition-transform shadow-lg shadow-brand/40">
            <Play className="h-6 w-6 fill-brand-foreground text-brand-foreground ml-0.5" />
          </div>
        </div>

        {/* Episode badge */}
        <div className="absolute top-2 left-2">
          <Badge className="bg-brand text-brand-foreground border-0 text-xs font-bold">
            EP {item.episodeNumber}
          </Badge>
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 inset-x-0 p-3">
          <h3 className="text-sm font-bold text-white line-clamp-1 group-hover:text-brand transition-colors">
            {item.title}
          </h3>
          <div className="flex items-center gap-2 text-xs text-white/70 mt-1">
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" /> {timeAgo(item.watchedAt, t)}
            </span>
            {item.totalEpisodes && (
              <span>· {item.episodeNumber}/{item.totalEpisodes} ep</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full progress-shimmer"
              style={{ width: `${Math.max(5, Math.min(100, item.progress))}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
