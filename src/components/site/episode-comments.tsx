'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useUIStore } from '@/lib/store';
import { sanitizeDisplayName, sanitizeComment } from '@/lib/security';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThumbsUp, Trash2, MessageSquare, Send, Loader2 } from 'lucide-react';
import { timeAgo } from '@/lib/types';
import { COMMENT_MAX_LENGTH, COMMENT_MIN_LENGTH } from '@/lib/limits';

interface ServerComment {
  id: string;
  userId: string;
  comment: string;
  likes: number;
  createdAt: string;
  user: { name: string | null; avatar: string | null };
}

interface CommentsPage {
  comments: ServerComment[];
  hasMore: boolean;
  nextCursor: string | null;
}

interface EpisodeCommentsProps {
  animeSlug: string;
  episodeNumber: number;
  animeTitle: string;
}

const COMMENTS_PAGE_SIZE = 20;

/**
 * Komentar episode.
 *
 * P2: sebelumnya seluruh komentar disimpan di localStorage (`useUIStore`),
 * jadi hanya terlihat oleh pengirimnya sendiri. Sekarang daftar dibaca dari
 * `/api/comments` (server, terlihat semua orang) dan pengiriman/penghapusan
 * lewat API yang sama. Store lokal hanya dipakai sebagai jejak aktivitas untuk
 * pencapaian (`AchievementsWidget`).
 */
export function EpisodeComments({ animeSlug, episodeNumber, animeTitle }: EpisodeCommentsProps) {
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const addLocalComment = useUIStore((s) => s.addEpisodeComment);

  const [comment, setComment] = useState('');

  const currentUserId = session?.user?.id;
  const isLoggedIn = Boolean(session?.user);

  const queryKey = ['episode-comments', animeSlug, episodeNumber];

  // Daftar komentar dari server (bukan localStorage) — inilah yang membuat
  // komentar terlihat oleh pengguna lain.
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        animeSlug,
        episodeNumber: String(episodeNumber),
        limit: String(COMMENTS_PAGE_SIZE),
      });
      if (pageParam) params.set('cursor', pageParam);

      const res = await fetch(`/api/comments?${params.toString()}`);
      if (!res.ok) throw new Error('Gagal memuat komentar');
      return (await res.json()) as CommentsPage;
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : null),
    staleTime: 30_000,
  });

  const comments: ServerComment[] = data?.pages.flatMap((page) => page.comments) ?? [];

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animeSlug,
          episodeNumber,
          comment: comment.trim(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Gagal kirim komentar');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Komentar terkirim');
      // Jejak lokal untuk pencapaian (bukan sumber daftar komentar).
      addLocalComment({
        animeSlug,
        episodeNumber,
        name: sanitizeDisplayName(session?.user?.name || 'Anonim'),
        comment: sanitizeComment(comment),
      });
      setComment('');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Gagal hapus komentar');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Komentar dihapus');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim().length < COMMENT_MIN_LENGTH) return;
    if (!isLoggedIn) {
      toast.error('Login dulu buat komentar');
      return;
    }
    submitMutation.mutate();
  };

  const loginUrl = `/auth/login?callbackUrl=${encodeURIComponent(pathname || '/')}`;
  const canDelete = (c: ServerComment) =>
    isLoggedIn && (c.userId === currentUserId || session?.user?.role === 'admin');

  return (
    <div className="space-y-3">
      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="space-y-2 p-3 rounded-lg border border-border/60 bg-card/40">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" /> Komentar Episode {episodeNumber}
        </div>

        {sessionStatus !== 'loading' && !isLoggedIn && (
          <p className="text-xs text-amber-400">
            Login dulu buat ikut berkomentar.{' '}
            <a href={loginUrl} className="underline font-semibold">
              Masuk di sini
            </a>
          </p>
        )}

        <Textarea
          placeholder={`Bagikan pendapatmu tentang ${animeTitle} EP ${episodeNumber}…`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="text-sm min-h-[70px] resize-none"
          maxLength={COMMENT_MAX_LENGTH}
          disabled={!isLoggedIn}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {comment.length}/{COMMENT_MAX_LENGTH}
            {session?.user?.name ? ` · sebagai ${session.user.name}` : ''}
          </span>
          <Button
            type="submit"
            disabled={comment.trim().length < COMMENT_MIN_LENGTH || submitMutation.isPending || !isLoggedIn}
            size="sm"
            className="bg-brand text-brand-foreground hover:bg-brand/90 disabled:opacity-40"
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Send className="h-3 w-3 mr-1" />
            )}
            {submitMutation.isPending ? 'Mengirim…' : 'Kirim'}
          </Button>
        </div>
      </form>

      {/* Comments list */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Komentar ({comments.length}
          {hasNextPage ? '+' : ''})
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg shimmer" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
            Gagal memuat komentar.{' '}
            <button onClick={() => refetch()} className="underline font-semibold">
              Coba lagi
            </button>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-30" />
            Belum ada komentar. Kasih komentar pertama!
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[200px] scrollbar-anichin pr-2">
              <div className="space-y-2">
                {comments.map((c) => {
                  const displayName = c.user?.name || 'Anonim';
                  return (
                    <div
                      key={c.id}
                      className="p-2.5 rounded-lg border border-border/60 bg-card/40 hover:border-border transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center font-bold text-brand-foreground text-xs shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs">{displayName}</span>
                            <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                          </div>
                          <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">{c.comment}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ThumbsUp className="h-3 w-3" /> {c.likes > 0 ? c.likes : 'Suka'}
                            </span>
                            {canDelete(c) && (
                              <button
                                onClick={() => deleteMutation.mutate(c.id)}
                                disabled={deleteMutation.isPending && deleteMutation.variables === c.id}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="h-3 w-3" /> {deleteMutation.isPending && deleteMutation.variables === c.id ? 'Menghapus…' : 'Hapus'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {hasNextPage && (
              <div className="text-center mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Memuat…' : 'Muat komentar lama'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
