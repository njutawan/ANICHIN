'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMounted } from '@/hooks/use-mounted';
import { formatViews, timeAgo, type EpisodeData } from '@/lib/types';
import { useUIStore } from '@/lib/store';

/**
 * Breaking News — eye-catching animated banner highlighting latest/important content.
 *
 * Sources (configurable via settings):
 * - 'latest': Latest episodes (default)
 * - 'trending': Trending anime titles
 * - 'random': Random anime picks
 *
 * Features:
 * - Flashing "BREAKING" badge with pulse animation
 * - Auto-rotating news items (every 5s)
 * - Click to open anime detail
 * - Dismissible (hidden per session)
 * - Eye-catching red/amber gradient
 */

type NewsSource = 'latest' | 'trending' | 'random';

interface NewsItem {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  badge: string;
}

export function BreakingNews() {
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const openDetail = useUIStore((s) => s.openDetail);

  // Check if dismissed this session
  useEffect(() => {
    if (sessionStorage.getItem('anichin-breaking-dismissed') === 'true') {
      setDismissed(true);
    }
  }, []);

  // Fetch latest episodes as breaking news
  const { data } = useQuery({
    queryKey: ['breaking-news'],
    queryFn: async () => {
      const res = await fetch('/api/latest?page=1&limit=10');
      if (!res.ok) throw new Error('latest');
      return res.json();
    },
    staleTime: 60_000,
  });

  const episodes: EpisodeData[] = data?.episodes ?? [];

  // Transform episodes to news items
  const newsItems: NewsItem[] = episodes.slice(0, 8).map((ep) => ({
    id: ep.id,
    title: `${ep.anime.title} Episode ${ep.number}`,
    subtitle: `${timeAgo(ep.releasedAt)} · ${formatViews(ep.views)} views`,
    slug: ep.anime.slug,
    badge: ep.anime.type === 'Movie' ? 'MOVIE' : 'EP BARU',
  }));

  // Auto-rotate news items
  useEffect(() => {
    if (dismissed || newsItems.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % newsItems.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [dismissed, newsItems.length]);

  if (!mounted || dismissed || newsItems.length === 0) return null;

  const current = newsItems[currentIndex];

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('anichin-breaking-dismissed', 'true');
  };

  return (
    <div className="relative z-40 bg-gradient-to-r from-red-950/80 via-red-900/60 to-red-950/80 border-b border-red-500/30 overflow-hidden">
      {/* Animated background pulse */}
      <div className="absolute inset-0 bg-red-500/5 animate-pulse" />

      <div className="container-fluid relative flex items-center gap-3 py-2">
        {/* BREAKING badge — eye-catching with pulse */}
        <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500 shadow-lg shadow-red-500/30">
          <Zap className="h-3 w-3 text-white fill-white animate-pulse" />
          <span className="text-xs font-black text-white tracking-wider uppercase animate-pulse">
            BREAKING
          </span>
        </div>

        {/* News content — auto-rotating */}
        <div
          className="flex-1 min-w-0 overflow-hidden cursor-pointer group"
          onClick={() => openDetail(current.slug)}
        >
          <div className="flex items-center gap-2 transition-transform duration-500">
            {/* Badge (EP BARU / MOVIE) */}
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {current.badge}
            </span>

            {/* Title + subtitle */}
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-white truncate block group-hover:text-amber-300 transition-colors">
                {current.title}
              </span>
              <span className="text-xs text-white/50 truncate hidden sm:block">
                {current.subtitle}
              </span>
            </div>
          </div>
        </div>

        {/* Pagination dots */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {newsItems.slice(0, 5).map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                'h-1 rounded-full transition-all',
                i === currentIndex ? 'w-4 bg-amber-400' : 'w-1 bg-white/30 hover:bg-white/50'
              )}
              aria-label={`News ${i + 1}`}
            />
          ))}
        </div>

        {/* Next button */}
        <button
          onClick={() => setCurrentIndex((i) => (i + 1) % newsItems.length)}
          className="shrink-0 h-7 w-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          aria-label="Berikutnya"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 h-7 w-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
          aria-label="Tutup breaking news"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom gradient line */}
      <div className="h-0.5 bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
    </div>
  );
}
