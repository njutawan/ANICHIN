'use client';

import Link from 'next/link';
import { Play, Star, Eye, Clock, Bookmark, BookmarkCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useUIStore } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatViews, timeAgo, type AnimeCardData, type EpisodeData } from '@/lib/types';
import { useMounted } from '@/hooks/use-mounted';
import { AnimeImage } from './anime-image';
import { useI18n } from '@/lib/i18n-context';
import { animePath } from '@/lib/site';

interface AnimeCardProps {
  anime: AnimeCardData;
  className?: string;
  showRank?: number;
  showBookmark?: boolean;
  featured?: boolean; // larger card for visual hierarchy
}

export function AnimeCard({ anime, className, showRank, featured = false }: AnimeCardProps) {
  const { t } = useI18n();
  const openDetail = useUIStore((s) => s.openDetail);
  const openWatch = useUIStore((s) => s.openWatch);
  const toggleBookmark = useUIStore((s) => s.toggleBookmark);
  const rawBookmarked = useUIStore((s) => s.bookmarks.some((b) => b.slug === anime.slug));
  const mounted = useMounted();
  const isBookmarked = mounted && rawBookmarked;

  const onToggleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    const wasBookmarked = rawBookmarked;
    toggleBookmark({
      slug: anime.slug,
      title: anime.title,
      poster: anime.poster,
      addedAt: Date.now(),
    });
    if (wasBookmarked) {
      toast.success(t('card.bookmarkRemoved'), { description: anime.title });
    } else {
      toast.success(t('card.bookmarkSaved'), { description: anime.title });
    }
  };

  // Klik biasa → buka modal cepat (UX lama, tanpa pindah halaman).
  // Ctrl/Cmd/Shift+klik atau klik tengah → biarkan browser membuka halaman
  // kanonik `/anime/<slug>` di tab baru (link-nya nyata, jadi crawler juga
  // bisa mengikuti). Sebelumnya kartu bukan anchor sama sekali sehingga tidak
  // ada jalur internal link menuju halaman anime.
  const isModifiedClick = (e: React.MouseEvent) =>
    e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

  const onLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isModifiedClick(e)) return; // biarkan browser buka tab baru
    e.preventDefault(); // cegah navigasi next/link (defaultPrevented dibaca Link)
    openDetail(anime.slug);
  };

  const onCardClick = (e: React.MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented) return; // sudah ditangani onClick pada <Link>
    if (isModifiedClick(e)) return;
    e.preventDefault();
    openDetail(anime.slug);
  };

  return (
    <article
      className={cn('group cursor-pointer animate-scale-in flex flex-col h-full', className)}
      onClick={onCardClick}
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-border/60 bg-card transition-all duration-300 group-hover:border-brand/60 group-hover:shadow-xl group-hover:shadow-brand/10 group-hover:-translate-y-1">
        <AnimeImage src={anime.poster}
          alt={anime.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Top badges — neutral colors, gold reserved for CTA only */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-xs font-bold uppercase tracking-wide">
            {anime.type}
          </Badge>
          <Badge className="bg-black/80 text-white border-0 text-xs font-bold">
            <Star className="h-2.5 w-2.5 mr-0.5 fill-amber-400 text-amber-400" />
            {anime.score.toFixed(1)}
          </Badge>
        </div>

        {/* Bookmark button (top-right, below score) */}
        <button
          onClick={onToggleBookmark}
          aria-label={isBookmarked ? t('card.removeBookmark') : t('card.addBookmark')}
          title={isBookmarked ? t('card.removeBookmark') : t('card.addBookmark')}
          className={cn(
            'absolute top-9 right-2 h-8 w-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 z-20',
            isBookmarked
              ? 'bg-amber-500 text-black opacity-100'
              : 'bg-black/60 text-white hover:bg-amber-500 hover:text-black'
          )}
        >
          {isBookmarked ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
        </button>

        {/* Rank ribbon */}
        {typeof showRank === 'number' && (
          <div className="absolute top-0 left-0 bg-gradient-to-r from-brand to-amber-600 text-brand-foreground font-black text-xs px-2 py-0.5 rounded-br-lg shadow-lg z-10">
            #{showRank}
          </div>
        )}

        {/* Hover overlay with play */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
        <button
          onClick={(e) => { e.stopPropagation(); openWatch(anime.slug, 1); }}
          aria-label={t('card.watchAnime').replace('{title}', anime.title)}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        >
          <div className="h-12 w-12 rounded-full bg-brand/90 backdrop-blur flex items-center justify-center scale-50 group-hover:scale-100 transition-transform duration-300 shadow-lg shadow-brand/40">
            <Play className="h-5 w-5 fill-brand-foreground text-brand-foreground ml-0.5" />
          </div>
        </button>

        {/* Bottom info */}
        <div className="absolute bottom-0 inset-x-0 p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            {anime.status === 'Ongoing' && (
              <Badge className="bg-green-500/90 text-white border-0 text-xs font-semibold px-1.5 py-0">
                ● {t('common.ongoing')}
              </Badge>
            )}
            {anime.status === 'Completed' && (
              <Badge className="bg-blue-500/90 text-white border-0 text-xs font-semibold px-1.5 py-0">
                ✓ {t('common.completed')}
              </Badge>
            )}
            {anime.status === 'Upcoming' && (
              <Badge className="bg-amber-500/90 text-black border-0 text-xs font-semibold px-1.5 py-0">
                ◆ {t('common.upcoming')}
              </Badge>
            )}
            {anime.releasedEpisodes != null && (
              <Badge className="bg-black/70 text-white border-0 text-xs font-semibold px-1.5 py-0">
                EP {anime.releasedEpisodes}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span className="flex items-center gap-0.5">
              <Eye className="h-2.5 w-2.5" /> {formatViews(anime.views)}
            </span>
            {anime.airedDay && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" /> {anime.airedDay.slice(0, 3)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Title — featured cards have larger title + more genres.
          Card uses flex-col h-full so this section stretches to match sibling
          cards in grid/rail layouts (consistent height even when titles wrap). */}
      <div className="mt-2 px-0.5 flex-1 flex flex-col">
        <h3 className={cn(
          'font-semibold leading-tight line-clamp-2 group-hover:text-amber-400 transition-colors min-h-[2.5rem]',
          featured ? 'text-base' : 'text-sm'
        )}>
          <Link href={animePath(anime.slug)} onClick={onLinkClick} className="hover:underline focus-visible:underline">
            {anime.title}
          </Link>
        </h3>
        {anime.titleJp && (
          <p className="text-xs text-foreground/70 line-clamp-1 mt-0.5 min-h-[1rem]">{anime.titleJp}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1.5 line-clamp-1">
          {anime.genres.slice(0, featured ? 3 : 2).map((g) => (
            <span
              key={g}
              className="text-xs px-1.5 py-0.5 rounded bg-secondary/60 text-foreground/70 border border-border/40"
            >
              {g}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

interface EpisodeCardProps {
  episode: EpisodeData;
}

export function EpisodeCard({ episode }: EpisodeCardProps) {
  const { t } = useI18n();
  const openDetail = useUIStore((s) => s.openDetail);
  const openWatch = useUIStore((s) => s.openWatch);
  const { anime } = episode;
  return (
    <article
      className="group cursor-pointer animate-scale-in flex flex-col h-full"
      onClick={() => openDetail(anime.slug)}
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-border/60 bg-card transition-all duration-300 group-hover:border-brand/60 group-hover:shadow-xl group-hover:shadow-brand/10 group-hover:-translate-y-1">
        <AnimeImage src={anime.poster}
          alt={anime.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-xs font-bold uppercase tracking-wide">
            {anime.type}
          </Badge>
          {anime.status === 'Ongoing' && (
            <Badge className="bg-green-500/90 text-white border-0 text-xs font-semibold">
              ● {t('common.ongoing')}
            </Badge>
          )}
        </div>

        {/* Episode ribbon */}
        <div className="absolute top-9 left-0 bg-brand text-brand-foreground font-black text-xs px-2 py-0.5 rounded-br-lg shadow-lg z-10">
          EP {episode.number}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />
        <button
          onClick={(e) => { e.stopPropagation(); openWatch(anime.slug, episode.number); }}
          aria-label={t('card.watchAnimeEp').replace('{title}', anime.title).replace('{n}', String(episode.number))}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        >
          <div className="h-12 w-12 rounded-full bg-brand/90 backdrop-blur flex items-center justify-center scale-50 group-hover:scale-100 transition-transform duration-300 shadow-lg shadow-brand/40">
            <Play className="h-5 w-5 fill-brand-foreground text-brand-foreground ml-0.5" />
          </div>
        </button>

        <div className="absolute bottom-0 inset-x-0 p-2.5">
          <div className="flex items-center gap-2 text-xs text-white/80">
            <span className="flex items-center gap-0.5">
              <Eye className="h-2.5 w-2.5" /> {formatViews(episode.views)}
            </span>
            <span>·</span>
            <span>{timeAgo(episode.releasedAt, t)}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 px-0.5 flex-1 flex flex-col">
        <h3 className="text-sm font-semibold leading-tight line-clamp-2 group-hover:text-brand transition-colors min-h-[2.5rem]">
          {anime.title}
        </h3>
        <p className="text-xs text-foreground/70 line-clamp-1 mt-0.5">
          {t('card.episodeNAgo').replace('{n}', String(episode.number)).replace('{ago}', timeAgo(episode.releasedAt, t))}
        </p>
      </div>
    </article>
  );
}

interface CardSkeletonProps {
  count?: number;
}
export function AnimeCardSkeleton({ count = 6 }: CardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2" style={{ animationDelay: `${i * 40}ms` }}>
          <div className="aspect-[2/3] rounded-lg shimmer relative overflow-hidden">
            {/* Skeleton badges */}
            <div className="absolute top-2 left-2 right-2 flex justify-between">
              <div className="h-4 w-10 rounded shimmer bg-card/60" />
              <div className="h-4 w-8 rounded shimmer bg-card/60" />
            </div>
          </div>
          <div className="h-3 w-3/4 rounded shimmer" />
          <div className="h-2.5 w-1/2 rounded shimmer" />
          <div className="flex gap-1">
            <div className="h-3 w-10 rounded shimmer" />
            <div className="h-3 w-12 rounded shimmer" />
          </div>
        </div>
      ))}
    </>
  );
}
