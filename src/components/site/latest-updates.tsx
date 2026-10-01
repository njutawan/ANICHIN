'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { EpisodeCard, AnimeCardSkeleton } from './anime-card';
import { Button } from '@/components/ui/button';
import type { EpisodeData } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

export function LatestUpdates() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [all, setAll] = useState<EpisodeData[]>([]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['latest', page],
    queryFn: async () => {
      const res = await fetch(`/api/latest?page=${page}&limit=18`);
      if (!res.ok) throw new Error('latest');
      return res.json();
    },
  });

  const episodes = data?.episodes ?? [];
  const combined = page === 1 ? episodes : [...all, ...episodes];

  if (data && page > 1 && combined.length > all.length) {
    if (all.length !== combined.length) setAll(combined);
  }

  const hasMore = data ? page < data.totalPages : false;

  return (
    <section id="latest" className="py-8">
      <SectionHeading
        title={t('section.latest')}
        subtitle={t('section.subtitle.latest')}
        icon={Sparkles}
      />

      {isLoading && page === 1 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-responsive-sm mt-5">
          <AnimeCardSkeleton count={12} />
        </div>
      ) : combined.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/60 rounded-lg mt-5">
          <Sparkles className="h-10 w-10 text-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-semibold">{t('empty.noLatest')}</p>
          <p className="text-xs text-foreground/60 mt-1">{t('empty.noLatestDesc')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-responsive-sm mt-5">
            {combined.map((ep) => (
              <EpisodeCard key={`${ep.anime.slug}-${ep.number}`} episode={ep} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-8">
              <Button
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
                variant="outline"
                size="lg"
                className="border-brand/40 text-brand hover:bg-brand/10"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('common.loadingDots')}
                  </>
                ) : (
                  <>
                    {t('common.loadMoreCap')} <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function SectionHeading({
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-1.5 rounded-full bg-gradient-to-b from-brand to-amber-600 shrink-0" />
        <div className="min-w-0">
          <h2 className="heading-section flex items-center gap-2 text-balance-fluid">
            {Icon && <Icon className="h-5 w-5 text-brand shrink-0" />}
            <span className="truncate">{title}</span>
          </h2>
          {subtitle && (
            <p className="text-fluid-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
