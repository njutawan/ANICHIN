'use client';

import { Play, Clock, Calendar } from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { formatViews, timeAgo } from '@/lib/types';

export interface ServerEpisode {
  id: string;
  number: number;
  title: string | null;
  duration: string | null;
  releasedAt: string | Date;
  views: number;
}

interface AnimeEpisodeListProps {
  slug: string;
  episodes: ServerEpisode[];
}

/**
 * Daftar episode server-rendered (teks episode ada di HTML → bisa diindeks),
 * tombol play membuka player modal yang sama dengan modal detail.
 */
export function AnimeEpisodeList({ slug, episodes }: AnimeEpisodeListProps) {
  const openWatch = useUIStore((s) => s.openWatch);

  if (episodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Episode belum tersedia.</p>
    );
  }

  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden">
      {episodes.map((ep) => (
        <li key={ep.id}>
          <button
            type="button"
            onClick={() => openWatch(slug, ep.number)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-card/60 transition-colors"
          >
            <span className="h-8 w-8 shrink-0 rounded-md bg-brand/15 text-brand flex items-center justify-center text-xs font-bold">
              {ep.number}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium truncate">
                {ep.title || `Episode ${ep.number}`}
              </span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                {ep.duration && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {ep.duration}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {timeAgo(ep.releasedAt)}
                </span>
                <span>{formatViews(ep.views)} views</span>
              </span>
            </span>
            <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}
