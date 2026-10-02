'use client';

import { AnimeImage } from './anime-image';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Play, Pause,  X, Film, ChevronRight,
} from 'lucide-react';
import { SectionHeading } from './latest-updates';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatViews } from '@/lib/types';
import { homeQueryKeys } from '@/lib/queries/home';
import type { AnimeCardData } from '@/lib/types';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function TrailersSection() {
  const openDetail = useUIStore((s) => s.openDetail);
  const [trailerSlug, setTrailerSlug] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: homeQueryKeys.trailers,
    queryFn: async () => {
      const res = await fetch('/api/featured');
      if (!res.ok) throw new Error('featured');
      return res.json();
    },
  });

  const featured: AnimeCardData[] = (data?.featured ?? []).slice(0, 5);
  if (!isLoading && featured.length === 0) return null;

  const [main, ...rest] = featured;

  return (
    <section className="py-8">
      <SectionHeading
        title="Trailer & MV"
        subtitle="Trailer dan MV anime pilihan"
        icon={Film}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mt-5">
          <div className="aspect-video rounded-xl shimmer" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg shimmer" />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mt-5">
          {/* Main trailer player */}
          {main && (
            <button
              onClick={() => setTrailerSlug(main.slug)}
              className="group relative aspect-video rounded-xl overflow-hidden border border-border/60 hover:border-brand/60 transition-all text-left"
            >
             <img
                src={main.banner || main.poster}
                alt={main.title}
                className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

              {/* Play overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-brand/90 backdrop-blur flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-300 shadow-2xl shadow-brand/40">
                  <Play className="h-7 w-7 fill-brand-foreground text-brand-foreground ml-1" />
                </div>
              </div>

              {/* Badge */}
              <div className="absolute top-3 left-3 flex gap-2">
                <Badge className="bg-brand text-brand-foreground border-0 text-xs font-bold">TRAILER UTAMA</Badge>
                <Badge className="bg-black/70 backdrop-blur text-white border-0 text-xs font-bold">HD 1080p</Badge>
              </div>

              {/* Info */}
              <div className="absolute bottom-0 inset-x-0 p-4">
                <h3 className="text-lg font-black text-white">{main.title}</h3>
                {main.titleJp && <p className="text-brand text-sm">{main.titleJp}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-white/70">
                  <span>{formatViews(main.views)} views</span>
                  <span>·</span>
                  <span>{main.studio}</span>
                  <span>·</span>
                  <span>⭐ {main.score.toFixed(1)}</span>
                </div>
              </div>
            </button>
          )}

          {/* Sidebar list */}
          <div className="space-y-2">
            {rest.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setTrailerSlug(a.slug)}
                className="group w-full flex items-center gap-2 p-2 rounded-lg border border-border/60 hover:border-brand/40 hover:bg-brand/5 transition-all text-left"
              >
                <div className="relative shrink-0 h-14 w-24 rounded overflow-hidden">
                 <AnimeImage src={a.banner || a.poster} alt={a.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="h-5 w-5 text-brand fill-brand" />
                  </div>
                  <div className="absolute top-1 right-1">
                    <Badge className="bg-black/80 text-white border-0 text-xs font-bold">#{i + 2}</Badge>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate group-hover:text-brand transition-colors">{a.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span>⭐ {a.score.toFixed(1)}</span>
                    <span>·</span>
                    <span>{formatViews(a.views)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trailer modal */}
      <TrailerModal slug={trailerSlug} onClose={() => setTrailerSlug(null)} onDetail={(s) => { setTrailerSlug(null); setTimeout(() => openDetail(s), 100); }} />
    </section>
  );
}

function TrailerModal({ slug, onClose, onDetail }: { slug: string | null; onClose: () => void; onDetail: (s: string) => void }) {
  const { data: anime } = useQuery({
    queryKey: ['anime-detail', slug],
    queryFn: async () => {
      const res = await fetch(`/api/anime/${slug}`);
      if (!res.ok) throw new Error('detail');
      return res.json();
    },
    enabled: !!slug,
  });

  const [playing, setPlaying] = useState(true);

  return (
    <Dialog open={!!slug} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-4xl w-[min(96vw,880px)] p-0 gap-0 bg-background border-border overflow-hidden"
        aria-describedby="trailer-desc"
      >
        <DialogTitle className="sr-only">{anime ? `Trailer ${anime.title}` : 'Trailer'}</DialogTitle>
        <DialogDescription id="trailer-desc" className="sr-only">
          Tonton trailer anime.
        </DialogDescription>
        {anime ? (
          <div>
            {/* Player */}
            <div className="relative aspect-video bg-black">
             <AnimeImage src={anime.banner || anime.poster} alt={anime.title} className={cn('absolute inset-0 w-full h-full object-cover transition-all', playing ? 'opacity-80' : 'opacity-50 blur-sm')} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute top-3 left-3 flex gap-2">
                <Badge className="bg-red-500/90 text-white border-0 text-xs font-bold animate-pulse">● TRAILER</Badge>
                <Badge className="bg-black/70 text-white border-0 text-xs font-bold">1080p</Badge>
              </div>
              <button onClick={onClose} className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/60 hover:bg-brand hover:text-brand-foreground flex items-center justify-center text-white" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
              {/* Center play/pause */}
              <button
                onClick={() => setPlaying((p) => !p)}
                className="absolute inset-0 flex items-center justify-center group"
                aria-label={playing ? 'Jeda' : 'Putar'}
              >
                <div className={cn('h-16 w-16 rounded-full bg-brand/90 flex items-center justify-center shadow-2xl shadow-brand/40 transition-all', playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100')}>
                  {playing ? <Pause className="h-7 w-7 fill-brand-foreground text-brand-foreground" /> : <Play className="h-7 w-7 fill-brand-foreground text-brand-foreground ml-1" />}
                </div>
              </button>
            </div>
            {/* Info */}
            <div className="p-4">
              <div className="flex items-start gap-3">
               <AnimeImage src={anime.poster} alt={anime.title} className="h-20 w-14 rounded object-cover border border-border/60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-black">{anime.title}</h3>
                  {anime.titleJp && <p className="text-brand text-sm">{anime.titleJp}</p>}
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>⭐ {anime.score.toFixed(1)}</span>
                    <span>·</span>
                    <span>{formatViews(anime.views)} views</span>
                    <span>·</span>
                    <span>{anime.studio}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{anime.synopsis}</p>
                </div>
                <Button onClick={() => onDetail(anime.slug)} size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 shrink-0">
                  Lihat Detail <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-muted-foreground text-sm">Loading…</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
