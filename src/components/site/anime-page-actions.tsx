'use client';

import { useState } from 'react';
import { Play, Bookmark, BookmarkCheck, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useUIStore } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/button';
import { animeUrl } from '@/lib/site';

interface AnimePageActionsProps {
  slug: string;
  title: string;
  poster: string;
  firstEpisode: number | null;
}

/**
 * CTA interaktif di halaman detail anime (server-rendered).
 * Logika tetap memakai store client yang sama dengan modal, jadi perilakunya
 * konsisten: buka player, toggle bookmark, dan bagikan link kanonik
 * `/anime/<slug>` (bukan `/?anime=<slug>`).
 */
export function AnimePageActions({ slug, title, poster, firstEpisode }: AnimePageActionsProps) {
  const { t } = useI18n();
  const openWatch = useUIStore((s) => s.openWatch);
  const toggleBookmark = useUIStore((s) => s.toggleBookmark);
  const rawBookmarked = useUIStore((s) => s.bookmarks.some((b) => b.slug === slug));
  const mounted = useMounted();
  const isBookmarked = mounted && rawBookmarked;
  const [shared, setShared] = useState(false);

  const onWatch = () => {
    if (firstEpisode == null) {
      toast.info('Episode belum tersedia.');
      return;
    }
    openWatch(slug, firstEpisode);
  };

  const onToggleBookmark = () => {
    toggleBookmark({ slug, title, poster, addedAt: Date.now() });
    toast.success(
      isBookmarked
        ? t('card.bookmarkRemoved')
        : t('card.bookmarkSaved'),
      { description: title }
    );
  };

  const onShare = async () => {
    const url = animeUrl(slug);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      toast.success(t('detail.linkCopied'));
      setTimeout(() => setShared(false), 2000);
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
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onWatch} className="bg-brand text-brand-foreground hover:bg-brand/90 font-semibold">
        <Play className="h-4 w-4 mr-1.5 fill-current" />
        {t('hero.watchNow')}
      </Button>
      <Button variant="outline" onClick={onToggleBookmark} aria-pressed={isBookmarked}>
        {isBookmarked ? <BookmarkCheck className="h-4 w-4 mr-1.5" /> : <Bookmark className="h-4 w-4 mr-1.5" />}
        {isBookmarked ? t('card.removeBookmark') : t('card.addBookmark')}
      </Button>
      <Button variant="ghost" onClick={onShare} aria-label={t('detail.share')}>
        {shared ? <Check className="h-4 w-4 text-brand" /> : <Share2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}
