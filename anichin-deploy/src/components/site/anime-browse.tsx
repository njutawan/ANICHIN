'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, Grid3x3, X } from 'lucide-react';
import { AnimeCard, AnimeCardSkeleton } from './anime-card';
import { SectionHeading } from './latest-updates';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import type { AnimeCardData } from '@/lib/types';

// Type options — labels are kept literal (industry proper nouns).
const TYPE_OPTIONS = [
  { value: 'all', labelKey: 'common.all' },
  { value: 'TV', label: 'TV' },
  { value: 'Movie', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
];

const SORT_OPTIONS = [
  { value: 'latest', labelKey: 'sort.latest' },
  { value: 'score', labelKey: 'sort.score' },
  { value: 'views', labelKey: 'sort.popular' },
  { value: 'title', labelKey: 'sort.az' },
];

export function AnimeBrowseSection() {
  const { t } = useI18n();
  const [genre, setGenre] = useState('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('latest');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const { data: genresData } = useQuery({
    queryKey: ['genres-list'],
    queryFn: async () => {
      const res = await fetch('/api/genres');
      if (!res.ok) throw new Error('genres');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const genres: { id: string; name: string; slug: string; count: number }[] = (genresData?.genres ?? []).filter((g: any) => g.count > 0);

  const params = new URLSearchParams({ genre, type, sort, page: String(page), limit: '18' });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['anime-list', genre, type, sort, page],
    queryFn: async () => {
      const res = await fetch(`/api/anime?${params}`);
      if (!res.ok) throw new Error('anime list');
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  const animes: AnimeCardData[] = data?.animes ?? [];
  const totalPages = data?.totalPages ?? 1;
  const hasActiveFilter = genre !== 'all' || type !== 'all' || sort !== 'latest';

  const resetFilters = () => {
    setGenre('all');
    setType('all');
    setSort('latest');
    setPage(1);
  };

  return (
    <section id="list" className="py-8 scroll-mt-24">
      <SectionHeading
        title={t('section.browseAnime')}
        subtitle={t('section.subtitle.browse')}
        icon={Grid3x3}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className={cn('lg:hidden border-border', showFilters && 'border-brand/50 text-brand')}
          >
            <Filter className="h-4 w-4 mr-1" /> {t('common.filter')}
            {hasActiveFilter && <span className="ml-1 h-2 w-2 rounded-full bg-brand" />}
          </Button>
        }
      />

      {/* Filter bar */}
      <div className={cn('mt-4 rounded-xl border border-border/60 bg-card/40 p-3 space-y-3', !showFilters && 'hidden lg:block')}>
        {/* Genre chips */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('common.genre')}</div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-anichin pr-1">
            <Chip active={genre === 'all'} onClick={() => { setGenre('all'); setPage(1); }}>
              {t('common.allGenres')}
            </Chip>
            {genres.map((g) => (
              <Chip key={g.slug} active={genre === g.slug} onClick={() => { setGenre(g.slug); setPage(1); }}>
                {g.name} <span className="opacity-50 text-xs">{g.count}</span>
              </Chip>
            ))}
          </div>
        </div>

        {/* Type + Sort */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('common.type')}</div>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((tp) => (
                <Chip key={tp.value} active={type === tp.value} onClick={() => { setType(tp.value); setPage(1); }}>
                  {tp.labelKey ? t(tp.labelKey) : tp.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('common.sort')}</div>
            <div className="flex flex-wrap gap-1.5">
              {SORT_OPTIONS.map((s) => (
                <Chip key={s.value} active={sort === s.value} onClick={() => { setSort(s.value); setPage(1); }}>
                  {t(s.labelKey)}
                </Chip>
              ))}
            </div>
          </div>
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground hover:text-destructive self-end">
              <X className="h-3.5 w-3.5 mr-1" /> {t('common.reset')}
            </Button>
          )}
        </div>
      </div>

      {/* Result meta */}
      <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
        <span>
          {isLoading ? t('common.loading') : t('common.animeFound').replace('{n}', String(data?.total ?? 0))}
          {genre !== 'all' && ` · ${t('common.genreLabel').replace('{name}', genres.find((g) => g.slug === genre)?.name ?? genre)}`}
        </span>
        {totalPages > 1 && (
          <span>{t('common.page').replace('{page}', String(page)).replace('{total}', String(totalPages))}</span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-responsive-sm mt-3">
          <AnimeCardSkeleton count={12} />
        </div>
      ) : animes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Grid3x3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          {t('empty.animeNotFound')}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-responsive-sm mt-3">
          {animes.map((a, i) => (
            <AnimeCard key={a.id} anime={a} showRank={sort === 'views' || sort === 'score' ? (page - 1) * 18 + i + 1 : undefined} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="border-border"
          >
            {t('common.previous')}
          </Button>
          {Array.from({ length: Math.min(7, totalPages) }).map((_, idx) => {
            let p: number;
            if (totalPages <= 7) p = idx + 1;
            else if (page <= 4) p = idx + 1;
            else if (page >= totalPages - 3) p = totalPages - 6 + idx;
            else p = page - 3 + idx;
            return (
              <Button
                key={p}
                variant={page === p ? 'default' : 'outline'}
                size="sm"
                disabled={isFetching}
                onClick={() => setPage(p)}
                className={cn(
                  'w-9 h-9 p-0',
                  page === p ? 'bg-brand text-brand-foreground hover:bg-brand/90' : 'border-border'
                )}
              >
                {p}
              </Button>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="border-border"
          >
            {t('common.next')}
          </Button>
        </div>
      )}
    </section>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-xs px-2.5 py-1 rounded-full border transition-colors',
        active
          ? 'bg-brand text-brand-foreground border-brand font-semibold'
          : 'bg-secondary/50 text-muted-foreground border-border/60 hover:bg-secondary hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
