'use client';

import { AnimeImage } from './anime-image';
import { GitBranch, ArrowRight, ArrowLeft, ArrowLeftRight, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatViews } from '@/lib/types';
import type { AnimeRelation } from '@/lib/types';
import { useUIStore } from '@/lib/store';

interface RelationsTabProps {
  relations: AnimeRelation[];
}

const RELATION_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; desc: string }> = {
  'Sequel': { icon: ArrowRight, color: 'bg-green-500/20 text-green-400 border-green-500/40', desc: 'Lanjutan cerita' },
  'Prequel': { icon: ArrowLeft, color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', desc: 'Cerita sebelumnya' },
  'Side Story': { icon: GitBranch, color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', desc: 'Cerita sampingan' },
  'Parent Story': { icon: GitBranch, color: 'bg-purple-500/20 text-purple-400 border-purple-500/40', desc: 'Cerita utama' },
  'Alternative': { icon: ArrowLeftRight, color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40', desc: 'Versi alternatif' },
  'Spin-off': { icon: GitBranch, color: 'bg-rose-500/20 text-rose-400 border-rose-500/40', desc: 'Spin-off' },
};

export function RelationsTab({ relations }: RelationsTabProps) {
  const openDetail = useUIStore((s) => s.openDetail);

  if (relations.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
        t("empty.noRelations")
      </div>
    );
  }

  const groups: Record<string, AnimeRelation[]> = {};
  for (const r of relations) {
    if (!groups[r.relation]) groups[r.relation] = [];
    groups[r.relation].push(r);
  }

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground">
        Anime yang berhubungan dengan seri ini — sekuel, prekuel, side story, dan alternatif.
      </div>

      {Object.entries(groups).map(([type, items]) => {
        const meta = RELATION_META[type] ?? RELATION_META['Side Story'];
        const Icon = meta.icon;
        return (
          <div key={type} className="animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center border', meta.color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-bold">{type}</div>
                <div className="text-xs text-muted-foreground">{meta.desc}</div>
              </div>
              <span className="ml-auto text-xs text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                {items.length} anime
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-10 border-l border-border/40">
              {items.map((r, i) => (
                <button
                  key={`${r.anime.slug}-${i}`}
                  onClick={() => openDetail(r.anime.slug)}
                  className="group flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-card/40 hover:border-brand/40 hover:bg-brand/5 transition-all text-left"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="relative shrink-0 h-14 w-10 rounded overflow-hidden border border-border/60">
                    <AnimeImage src={r.anime.poster} alt={r.anime.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate group-hover:text-brand transition-colors">
                      {r.anime.title}
                    </div>
                    {r.anime.titleJp && (
                      <div className="text-xs text-muted-foreground truncate">{r.anime.titleJp}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5 text-brand font-semibold">
                        <Star className="h-2.5 w-2.5 fill-brand" />{r.anime.score.toFixed(1)}
                      </span>
                      <span>·</span>
                      <span>{r.anime.type}</span>
                      <span>·</span>
                      <span>{formatViews(r.anime.views)}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs border-brand/40 text-brand shrink-0">
                    {r.anime.status}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
