'use client';

import { useUIStore } from '@/lib/store';
import { AnimeCard, AnimeCardSkeleton } from './anime-card';
import { SectionHeading } from './latest-updates';
import { BookmarkX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useMounted } from '@/hooks/use-mounted';
import type { AnimeCardData } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

/**
 * Shows the user's bookmarked anime (persisted in localStorage via Zustand).
 * Hidden entirely when empty so the section doesn't take space for new users.
 */
export function BookmarkSection() {
  const { t } = useI18n();
  const mounted = useMounted();
  const bookmarks = useUIStore((s) => s.bookmarks);
  const clearBookmarks = useUIStore((s) => s.clearBookmarks);
  const slugs = bookmarks.map((b) => b.slug).join(',');
  const hasBookmarks = mounted && bookmarks.length > 0;

  const { data, isLoading } = useQuery({
    queryKey: ['bookmarks-anime', slugs],
    queryFn: async () => {
      if (!slugs) return { animes: [] };
      const res = await fetch(`/api/anime?slugs=${encodeURIComponent(slugs)}&limit=48`);
      if (!res.ok) throw new Error('bookmarks fetch');
      return res.json();
    },
    enabled: hasBookmarks,
  });

  if (!mounted || !hasBookmarks) return null;

  const animes: AnimeCardData[] = (data?.animes ?? []) as AnimeCardData[];
  const ordered = bookmarks
    .map((b) => animes.find((a) => a.slug === b.slug))
    .filter((a): a is AnimeCardData => Boolean(a));

  return (
    <section id="bookmark" className="py-8 scroll-mt-24 animate-fade-up">
      <SectionHeading
        title={t('section.bookmarks')}
        subtitle={t('bookmark.subtitle').replace('{n}', String(bookmarks.length))}
        icon={HeartFilled}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={clearBookmarks}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> {t('bookmark.clear')}
          </Button>
        }
      />
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mt-5">
          <AnimeCardSkeleton count={Math.min(bookmarks.length, 6)} />
        </div>
      ) : ordered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookmarkX className="h-10 w-10 mx-auto mb-3 opacity-40" />
          {t('empty.noBookmarks')}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mt-5">
          {ordered.map((a) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}
    </section>
  );
}

function HeartFilled({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 21s-7-4.534-9.5-8.5C1 9.5 2.5 6 6 6c2 0 3.5 1.5 4 2.5C10.5 7.5 12 6 14 6c3.5 0 5 3.5 3.5 6.5C19 16.466 12 21 12 21z" />
    </svg>
  );
}
