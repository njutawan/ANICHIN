'use client';

import { AnimeImage } from './anime-image';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  X, Star, Calendar, Clock, Eye, Play, Download, Heart, Share2,
  Tv, Film, Bookmark, BookmarkCheck, ChevronRight, Layers, Sparkles, Users, Check, GitBranch,
} from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/security';
import { formatViews, timeAgo, type AnimeDetail, type AnimeCardData } from '@/lib/types';
import { useMounted } from '@/hooks/use-mounted';
import { ReviewsTab } from './reviews-tab';
import { CharactersTab } from './characters-tab';
import { RelationsTab } from './relations-tab';
import { useI18n } from '@/lib/i18n-context';

export function AnimeDetailModal() {
  const { t } = useI18n();
  const { detailOpen, detailSlug, closeDetail } = useUIStore();

  const { data: anime, isLoading } = useQuery({
    queryKey: ['anime-detail', detailSlug],
    queryFn: async () => {
      const res = await fetch(`/api/anime/${detailSlug}`);
      if (!res.ok) throw new Error('detail');
      return res.json();
    },
    enabled: !!detailSlug,
  });

  // Inject dynamic JSON-LD + OG meta tags when anime detail is open
  useEffect(() => {
    if (!anime?.slug) return;

    const injectedElements: HTMLElement[] = [];

    // 1. JSON-LD for Google rich snippets
    fetch(`/api/anime/${anime.slug}/jsonld`)
      .then(res => res.json())
      .then(data => {
        const scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.id = `jsonld-anime-${anime.slug}`;
        scriptEl.text = JSON.stringify(data.creativeWork);
        document.head.appendChild(scriptEl);
        injectedElements.push(scriptEl);
      })
      .catch(() => {});

    // 2. Dynamic OpenGraph meta tags for social sharing
    fetch(`/api/anime/${anime.slug}/og`)
      .then(res => res.json())
      .then(og => {
        const SITE_URL = process.env.NEXTAUTH_URL || 'https://anichin.id';
        const metas = [
          { prop: 'og:title', content: og.title },
          { prop: 'og:description', content: og.description },
          { prop: 'og:image', content: og.image?.startsWith('http') ? og.image : `${SITE_URL}${og.image}` },
          { prop: 'og:url', content: og.url },
          { prop: 'og:type', content: og.type },
          { name: 'twitter:title', content: og.title },
          { name: 'twitter:description', content: og.description },
          { name: 'twitter:image', content: og.image?.startsWith('http') ? og.image : `${SITE_URL}${og.image}` },
        ];

        metas.forEach(m => {
          const metaEl = document.createElement('meta');
          if (m.prop) metaEl.setAttribute('property', m.prop);
          if (m.name) metaEl.setAttribute('name', m.name);
          metaEl.setAttribute('content', m.content);
          metaEl.id = `og-anime-${m.prop || m.name}`;
          document.head.appendChild(metaEl);
          injectedElements.push(metaEl);
        });

        // Update page title for social crawlers
        document.title = og.title;
      })
      .catch(() => {});

    return () => {
      // Cleanup: remove all injected elements
      injectedElements.forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    };
  }, [anime?.slug]);

  return (
    <Dialog open={detailOpen} onOpenChange={(o) => !o && closeDetail()}>
      <DialogContent
        className="max-w-5xl w-[min(96vw,1080px)] p-0 gap-0 bg-background/95 backdrop-blur-xl border-border overflow-hidden max-h-dvh-92"
        aria-describedby="detail-desc"
      >
        <DialogTitle className="sr-only">
          {anime ? t('detail.titleWithName').replace('{title}', anime.title) : t('detail.titleFallback')}
        </DialogTitle>
        <DialogDescription id="detail-desc" className="sr-only">
          {t('detail.description')}
        </DialogDescription>
        {isLoading || !anime ? (
          <div className="flex items-center justify-center h-[400px]">
            <div className="text-muted-foreground text-sm">{t('common.loading')}</div>
          </div>
        ) : (
          <DetailBody anime={anime as AnimeDetail} onClose={closeDetail} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ anime, onClose }: { anime: AnimeDetail; onClose: () => void }) {
  const { t } = useI18n();
  const openWatch = useUIStore((s) => s.openWatch);
  const toggleBookmark = useUIStore((s) => s.toggleBookmark);
  const rawBookmarked = useUIStore((s) => s.bookmarks.some((b) => b.slug === anime.slug));
  const mounted = useMounted();
  const isBookmarked = mounted && rawBookmarked;
  const openDetail = useUIStore((s) => s.openDetail);
  const bookmarked = isBookmarked;
  const [shared, setShared] = useState(false);

  const onToggleBookmark = () => {
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

  const onShare = async () => {
    // Sanitize slug to prevent URL injection
    const safeSlug = anime.slug.replace(/[^a-z0-9-]/gi, '');
    const url = typeof window !== 'undefined' ? `${window.location.origin}/?anime=${safeSlug}` : '';
    const shareData = {
      title: anime.title,
      text: t('detail.shareText').replace('{title}', anime.title),
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        toast.success(t('detail.linkCopied'));
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShared(true);
        toast.success(t('detail.linkCopied'));
        setTimeout(() => setShared(false), 2000);
      } catch {
        toast.error(t('detail.copyFailed'));
      }
    }
  };

  return (
    <div className="max-h-dvh-92 overflow-y-auto scrollbar-anichin">
      {/* Banner header */}
      <div className="relative h-44 sm:h-56 md:h-64 shrink-0">
        <AnimeImage src={anime.banner || anime.poster}
          alt={anime.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/70 backdrop-blur border border-border hover:bg-brand hover:text-brand-foreground transition-colors flex items-center justify-center z-10"
          aria-label={t('detail.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 sm:px-6 pb-6 -mt-20 relative">
        <div className="flex flex-col md:flex-row gap-5">
          {/* Poster */}
          <div className="shrink-0 mx-auto md:mx-0">
            <div className="relative w-32 sm:w-40 md:w-44 aspect-[2/3] rounded-lg overflow-hidden border-2 border-border shadow-2xl shadow-black/60">
              <div className="absolute top-2 left-2">
                {typeof anime.rank === 'number' && (
                  <Badge className="bg-brand text-brand-foreground border-0 text-xs font-bold">
                    {t('detail.rank').replace('{n}', String(anime.rank))}
                  </Badge>
                )}
              </div>
              <AnimeImage src={anime.poster} alt={anime.title} className="h-full w-full object-cover" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 md:pt-16">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="secondary" className="bg-brand/20 text-brand border-brand/40 font-semibold">
                {anime.type}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'border-0 font-semibold',
                  anime.status === 'Ongoing'
                    ? 'bg-green-500/20 text-green-400'
                    : anime.status === 'Completed'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-amber-500/20 text-amber-400'
                )}
              >
                ● {anime.status}
              </Badge>
              {anime.rating && (
                <Badge variant="outline" className="border-border/60 text-muted-foreground">
                  {anime.rating}
                </Badge>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-balance">
              {anime.title}
            </h1>
            {anime.titleJp && (
              <p className="text-brand text-sm font-medium mt-1">{anime.titleJp}</p>
            )}
            {anime.titleEn && anime.titleEn !== anime.title && (
              <p className="text-xs text-muted-foreground mt-0.5">{anime.titleEn}</p>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <Stat icon={Star} label={t('detail.statScore')} value={anime.score.toFixed(1)} accent />
              <Stat icon={Eye} label={t('detail.statViews')} value={formatViews(anime.views)} />
              <Stat icon={Tv} label={t('detail.statEpisode')} value={`${anime.releasedEpisodes ?? 0}/${anime.totalEpisodes ?? '?'}`} />
              <Stat icon={Clock} label={t('detail.statDuration')} value={anime.duration ?? '—'} />
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
              {anime.studio && <Meta icon={Film} label={t('detail.metaStudio')} value={anime.studio} />}
              {anime.releasedYear && <Meta icon={Calendar} label={t('detail.metaRelease')} value={`${anime.releasedYear} · ${anime.season}`} />}
              {anime.source && <Meta icon={Layers} label={t('detail.metaSource')} value={anime.source} />}
              {anime.airedDay && <Meta icon={Calendar} label={t('detail.metaAiredDay')} value={anime.airedDay} />}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {anime.genres.map((g) => (
                <span
                  key={g}
                  className="text-xs px-2 py-0.5 rounded-full bg-secondary/70 border border-border/60 text-muted-foreground hover:bg-brand/15 hover:text-brand hover:border-brand/30 transition-colors cursor-default"
                >
                  {g}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <Button
                onClick={() => openWatch(anime.slug, 1)}
                className="bg-brand text-brand-foreground hover:bg-brand/90 font-bold glow-brand"
              >
                <Play className="h-4 w-4 mr-1 fill-brand-foreground" /> {t('detail.watch')}
              </Button>
              <Button
                onClick={onToggleBookmark}
                variant="outline"
                className={cn(
                  'border-border hover:bg-secondary',
                  bookmarked && 'border-brand/50 bg-brand/10 text-brand'
                )}
              >
                {bookmarked ? (
                  <>
                    <BookmarkCheck className="h-4 w-4 mr-1" /> {t('detail.saved')}
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4 mr-1" /> {t('detail.save')}
                  </>
                )}
              </Button>
              <Button variant="outline" size="icon" className="border-border hover:bg-secondary hover:text-brand">
                <Heart className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="border-border hover:bg-secondary hover:text-brand" onClick={onShare} title={t('detail.share')}>
                {shared ? <Check className="h-4 w-4 text-brand" /> : <Share2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs: Synopsis / Episodes / Characters / Recommendations / Reviews / Download */}
        <Tabs defaultValue="synopsis" className="mt-6">
          <TabsList className="bg-secondary/60 border border-border/60 flex-wrap h-auto">
            <TabsTrigger value="synopsis" className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground">
              {t('detail.synopsis')}
            </TabsTrigger>
            <TabsTrigger value="episodes" className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground">
              {t('common.episodes')} ({anime.episodes.length})
            </TabsTrigger>
            {anime.characters && anime.characters.length > 0 && (
              <TabsTrigger value="characters" className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground">
                <Users className="h-3 w-3 mr-1" /> {t('detail.characters')}
              </TabsTrigger>
            )}
            {anime.relations && anime.relations.length > 0 && (
              <TabsTrigger value="relations" className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground">
                <GitBranch className="h-3 w-3 mr-1" /> {t('detail.relations')}
              </TabsTrigger>
            )}
            <TabsTrigger value="recommendations" className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground">
              <Sparkles className="h-3 w-3 mr-1" /> {t('detail.recommendations')}
            </TabsTrigger>
            <TabsTrigger value="reviews" className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground">
              <Star className="h-3 w-3 mr-1" /> {t('detail.reviews')}
            </TabsTrigger>
            <TabsTrigger value="download" className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground">
              {t('detail.download')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="synopsis" className="mt-4">
            <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
              {anime.synopsis}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <InfoRow label={t('detail.infoAltTitle')} value={anime.titleJp || anime.titleEn || '-'} />
              <InfoRow label={t('detail.infoType')} value={anime.type} />
              <InfoRow label={t('detail.infoStatus')} value={anime.status} />
              <InfoRow label={t('detail.infoStudio')} value={anime.studio || '-'} />
              <InfoRow label={t('detail.infoReleaseYear')} value={`${anime.releasedYear ?? '-'} ${anime.season ? `(${anime.season})` : ''}`} />
              <InfoRow label={t('detail.infoTotalEpisodes')} value={`${anime.totalEpisodes ?? '-'}`} />
              <InfoRow label={t('detail.infoRating')} value={anime.rating || '-'} />
              <InfoRow label={t('detail.infoSource')} value={anime.source || '-'} />
            </div>
          </TabsContent>

          <TabsContent value="episodes" className="mt-4">
            <EpisodeList episodes={anime.episodes} onPlay={(ep) => openWatch(anime.slug, ep.number)} />
          </TabsContent>

          <TabsContent value="characters" className="mt-4">
            <CharactersTab
              characters={anime.characters ?? []}
              staff={anime.staff ?? []}
              animePoster={anime.poster}
              animeAccent={anime.score.toFixed(1)}
            />
          </TabsContent>

          <TabsContent value="relations" className="mt-4">
            <RelationsTab relations={anime.relations ?? []} />
          </TabsContent>

          <TabsContent value="recommendations" className="mt-4">
            <Recommendations slug={anime.slug} onPick={(s) => openDetail(s)} />
          </TabsContent>

          <TabsContent value="reviews" className="mt-4">
            <ReviewsTab slug={anime.slug} animeTitle={anime.title} baseScore={anime.score} />
          </TabsContent>

          <TabsContent value="download" className="mt-4">
            <DownloadList episodes={anime.episodes} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Recommendations({ slug, onPick }: { slug: string; onPick: (slug: string) => void }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['recommendations', slug],
    queryFn: async () => {
      const res = await fetch(`/api/recommendations/${slug}`);
      if (!res.ok) throw new Error('recs');
      return res.json();
    },
  });
  const recs: AnimeCardData[] = data?.recommendations ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-lg bg-card animate-pulse" />
        ))}
      </div>
    );
  }
  if (recs.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        {t('empty.noRecs')}
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        {t('empty.recDesc')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {recs.map((r) => (
          <button
            key={r.id}
            onClick={() => onPick(r.slug)}
            className="group text-left"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-border/60 hover:border-brand/60 transition-all hover:-translate-y-1">
              <div className="absolute top-1.5 left-1.5">
                <Badge className="bg-black/80 text-white border-0 text-xs font-bold">
                  {r.type}
                </Badge>
              </div>
              <div className="absolute top-1.5 right-1.5">
                <Badge className="bg-brand/90 text-brand-foreground border-0 text-xs font-bold">
                  ⭐ {r.score.toFixed(1)}
                </Badge>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-1.5">
                <div className="text-xs font-semibold text-white line-clamp-1 group-hover:text-brand transition-colors">
                  {r.title}
                </div>
                <div className="text-xs text-white/70 mt-0.5">{r.genres.slice(0,2).join(' · ')}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-2 flex items-center gap-2 min-w-0', accent ? 'border-brand/40 bg-brand/10' : 'border-border/60 bg-card/60')}>
      <Icon className={cn('h-4 w-4 shrink-0', accent ? 'text-brand' : 'text-muted-foreground')} />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={cn('text-sm font-bold whitespace-nowrap', accent && 'text-brand')}>{value}</div>
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <Icon className="h-3 w-3 text-brand" />
      <span className="text-muted-foreground/70">{label}:</span>
      <span className="text-foreground/80 font-medium">{value}</span>
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function EpisodeList({ episodes, onPlay }: { episodes: AnimeDetail['episodes']; onPlay?: (ep: AnimeDetail['episodes'][number]) => void }) {
  const { t } = useI18n();
  if (episodes.length === 0)
    return <div className="text-sm text-muted-foreground py-6 text-center">{t('empty.noEpisodes')}</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto scrollbar-anichin pr-1">
      {episodes.map((ep) => (
        <button
          key={ep.id}
          onClick={() => onPlay?.(ep)}
          className="group flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/60 hover:border-brand/60 hover:bg-brand/5 p-2.5 transition-colors cursor-pointer text-left"
        >
          <div className="relative shrink-0 h-14 w-24 rounded overflow-hidden">
            {ep.thumbnail ? (
              <AnimeImage src={ep.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-secondary" />
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="h-5 w-5 text-brand fill-brand" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-brand/20 text-brand border-0 text-xs font-bold">EP {ep.number}</Badge>
              {ep.duration && <span className="text-xs text-muted-foreground">{ep.duration}</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Eye className="h-2.5 w-2.5" /> {formatViews(ep.views)}
              </span>
              <span>·</span>
              <span>{timeAgo(ep.releasedAt, t)}</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-brand transition-colors shrink-0" />
        </button>
      ))}
    </div>
  );
}

function DownloadList({ episodes }: { episodes: AnimeDetail['episodes'] }) {
  const { t } = useI18n();
  if (episodes.length === 0)
    return <div className="text-sm text-muted-foreground py-6 text-center">{t('empty.noDownloads')}</div>;
  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-anichin pr-1">
      {episodes.map((ep) => (
        <div key={ep.id} className="rounded-lg border border-border/60 bg-card/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-brand/20 text-brand border-0 text-xs font-bold">EP {ep.number}</Badge>
              <span className="text-xs text-muted-foreground">
                {t('watch.episodeWithViews').replace('{ago}', timeAgo(ep.releasedAt, t)).replace('{views}', formatViews(ep.views))}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <DownloadButton quality="360p" size="~80MB" url={ep.download480} />
            <DownloadButton quality="720p" size="~150MB" url={ep.download720} />
            <DownloadButton quality="1080p" size="~300MB" url={ep.download1080} highlight />
          </div>
        </div>
      ))}
    </div>
  );
}

function DownloadButton({ quality, size, url, highlight }: { quality: string; size: string; url?: string | null; highlight?: boolean }) {
  const safeUrl = sanitizeUrl(url || '');
  return (
    <a
      href={safeUrl || '#'}
      onClick={(e) => !safeUrl && e.preventDefault()}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors',
        highlight
          ? 'border-brand/50 bg-brand/10 text-brand hover:bg-brand hover:text-brand-foreground'
          : 'border-border/60 bg-secondary/40 hover:bg-secondary hover:text-foreground'
      )}
    >
      <span className="flex items-center gap-1.5">
        <Download className="h-3.5 w-3.5" />
        {quality}
      </span>
      <span className="text-xs opacity-70">{size}</span>
    </a>
  );
}
