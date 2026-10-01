'use client';

import { AnimeImage } from './anime-image';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search, X, SlidersHorizontal, Star, Eye,
} from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatViews, type AnimeCardData } from '@/lib/types';
import { useMounted } from '@/hooks/use-mounted';
import { useI18n } from '@/lib/i18n-context';

export function SearchModal() {
  const { t } = useI18n();
  const mounted = useMounted();
  const open = useUIStore((s) => s.searchModalOpen);
  const closeSearchModal = useUIStore((s) => s.closeSearchModal);
  const openSearchModal = useUIStore((s) => s.openSearchModal);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('relevance');
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openDetail = useUIStore((s) => s.openDetail);

  // Listen for "/" key to open search modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isTyping) return;
      if (e.key === '/' && !open) {
        e.preventDefault();
        openSearchModal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, openSearchModal]);

  // Focus input when opened + reset on close
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!open && prevOpen.current) {
      // Reset on close (deferred to next tick to avoid effect warning)
      setTimeout(() => {
        setQuery('');
        setGenre('all');
        setType('all');
        setSort('relevance');
        setShowFilters(false);
      }, 0);
    }
    prevOpen.current = open;
  }, [open]);

  const setOpen = (v: boolean) => (v ? openSearchModal() : closeSearchModal());

  // Fetch genres for filter
  const { data: genresData } = useQuery({
    queryKey: ['genres-list'],
    queryFn: async () => {
      const res = await fetch('/api/genres');
      if (!res.ok) throw new Error('genres');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const genres: { id: string; name: string; slug: string; count: number }[] =
    (genresData?.genres ?? []).filter((g: any) => g.count > 0);

  // Search query — uses /api/anime with slugs filter when query is empty
  const params = new URLSearchParams();
  if (query.trim()) {
    // Use search endpoint when there's a text query
  }
  if (genre !== 'all') params.set('genre', genre);
  if (type !== 'all') params.set('type', type);
  params.set('sort', sort === 'relevance' ? 'views' : sort);
  params.set('limit', '48');

  const { data, isLoading } = useQuery({
    queryKey: ['search-modal', query, genre, type, sort],
    queryFn: async () => {
      if (query.trim().length >= 2) {
        const searchParams = new URLSearchParams({ q: query.trim() });
        const res = await fetch(`/api/search?${searchParams}`);
        if (!res.ok) throw new Error('search');
        const searchData = await res.json();
        // Apply genre/type filters client-side
        let results: any[] = searchData.results ?? [];
        if (genre !== 'all') results = results.filter((r) => r.genres?.some((g: string) => g.toLowerCase() === genre));
        if (type !== 'all') results = results.filter((r) => r.type === type);
        // Sort
        if (sort === 'score') results.sort((a, b) => b.score - a.score);
        else if (sort === 'views') results.sort((a, b) => b.views - a.views);
        else if (sort === 'title') results.sort((a, b) => a.title.localeCompare(b.title));
        return { animes: results, total: results.length };
      } else if (genre !== 'all' || type !== 'all') {
        const res = await fetch(`/api/anime?${params}`);
        if (!res.ok) throw new Error('anime');
        return res.json();
      }
      return { animes: [], total: 0 };
    },
    enabled: open,
  });

  const results: AnimeCardData[] = data?.animes ?? [];
  const total = data?.total ?? 0;

  const onPick = (slug: string) => {
    setOpen(false);
    setTimeout(() => openDetail(slug), 100);
  };

  if (!mounted) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-4xl w-[min(96vw,900px)] p-0 gap-0 bg-background/95 backdrop-blur-xl border-border overflow-hidden max-h-dvh-92 flex flex-col"
        aria-describedby="search-modal-desc"
      >
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <DialogDescription id="search-modal-desc" className="sr-only">
          {t('search.description')}
        </DialogDescription>

        {/* Search header */}
        <div className="shrink-0 border-b border-border/60 p-4">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder={t('search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-lg font-medium placeholder:text-muted-foreground"
            />
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                showFilters || genre !== 'all' || type !== 'all'
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> {t('common.filter')}
              {(genre !== 'all' || type !== 'all') && (
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              )}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="mt-4 space-y-3">
              {/* Genre chips */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('common.genre')}</div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-anichin">
                  <FilterChip active={genre === 'all'} onClick={() => setGenre('all')}>{t('common.all')}</FilterChip>
                  {genres.map((g) => (
                    <FilterChip key={g.slug} active={genre === g.slug} onClick={() => setGenre(g.slug)}>
                      {g.name} <span className="opacity-50 text-xs">{g.count}</span>
                    </FilterChip>
                  ))}
                </div>
              </div>
              {/* Type + Sort */}
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('common.type')}</div>
                  <div className="flex gap-1.5">
                    {['all', 'TV', 'Movie', 'OVA'].map((tp) => (
                      <FilterChip key={tp} active={type === tp} onClick={() => setType(tp)}>
                        {tp === 'all' ? t('common.all') : tp}
                      </FilterChip>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('common.sort')}</div>
                  <div className="flex gap-1.5">
                    {[
                      { v: 'relevance', k: 'sort.relevance' },
                      { v: 'score', k: 'sort.scoreShort' },
                      { v: 'views', k: 'sort.viewsShort' },
                      { v: 'title', k: 'sort.az' },
                    ].map((s) => (
                      <FilterChip key={s.v} active={sort === s.v} onClick={() => setSort(s.v)}>
                        {t(s.k)}
                      </FilterChip>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 scrollbar-anichin">
          <div className="p-4">
            {/* Results meta */}
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
              <span>
                {isLoading ? t('search.searching') : query.trim() || genre !== 'all' || type !== 'all'
                  ? t('common.animeFound').replace('{n}', String(total))
                  : t('empty.searchPrompt')}
              </span>
              {(query || genre !== 'all' || type !== 'all') && !isLoading && (
                <button
                  onClick={() => { setQuery(''); setGenre('all'); setType('all'); }}
                  className="text-brand hover:underline"
                >
                  {t('common.reset')}
                </button>
              )}
            </div>

            {/* Loading state */}
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="aspect-[2/3] rounded-lg shimmer" />
                    <div className="h-3 w-3/4 rounded shimmer" />
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">
                  {query.trim().length >= 2
                    ? t('empty.noSearchResultFor').replace('{query}', query)
                    : t('empty.startSearch')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {results.map((a) => (
                  <SearchResultCard key={a.id} anime={a} onClick={() => onPick(a.slug)} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
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

function SearchResultCard({ anime, onClick }: { anime: AnimeCardData; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left"
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-border/60 hover:border-brand/60 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/10">
        <AnimeImage src={anime.poster} alt={anime.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute top-1.5 left-1.5">
          <Badge className="bg-black/80 backdrop-blur text-white border-0 text-xs font-bold">{anime.type}</Badge>
        </div>
        <div className="absolute top-1.5 right-1.5">
          <Badge className="bg-brand/95 text-brand-foreground border-0 text-xs font-bold">
            <Star className="h-2 w-2 mr-0.5 fill-brand-foreground" />{anime.score.toFixed(1)}
          </Badge>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-1.5">
          <div className="text-xs font-semibold text-white line-clamp-1 group-hover:text-brand transition-colors">{anime.title}</div>
          <div className="text-xs text-white/70 mt-0.5 flex items-center gap-1.5">
            <span className="flex items-center gap-0.5"><Eye className="h-2 w-2" />{formatViews(anime.views)}</span>
            {anime.releasedEpisodes && <span>· EP {anime.releasedEpisodes}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}
