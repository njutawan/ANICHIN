'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, ThumbsUp, Trash2, MessageSquare, Send } from 'lucide-react';
import { timeAgo } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ServerReview {
  id: string;
  rating: number;
  comment: string;
  likes: number;
  createdAt: string;
  user: { name: string; avatar: string | null };
}

interface ReviewsTabProps {
  slug: string;
  animeTitle: string;
  baseScore: number;
}

export function ReviewsTab({ slug, animeTitle, baseScore }: ReviewsTabProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [hoverRating, setHoverRating] = useState(0);
  const [localRating, setLocalRating] = useState(0);

  // Fetch reviews from API (server-side, Google can read)
  const { data: reviewsData, isLoading } = useQuery({
    queryKey: ['reviews', slug],
    queryFn: async () => {
      const res = await fetch(`/api/reviews?animeSlug=${slug}`);
      if (!res.ok) throw new Error('reviews');
      return res.json() as Promise<{ reviews: ServerReview[] }>;
    },
    staleTime: 30_000,
  });

  const animeReviews = reviewsData?.reviews ?? [];
  const avgUserScore = animeReviews.length > 0
    ? animeReviews.reduce((sum, r) => sum + r.rating, 0) / animeReviews.length
    : 0;

  // Submit review to API (requires auth)
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animeSlug: slug,
          rating: localRating,
          comment: comment.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal kirim ulasan');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Ulasan terkirim');
      setComment('');
      setLocalRating(0);
      queryClient.invalidateQueries({ queryKey: ['reviews', slug] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || localRating < 1) return;
    if (!session?.user) {
      toast.error('Login dulu buat kasih ulasan');
      return;
    }
    submitMutation.mutate();
  };

  // Like review (client-side only — doesn't affect Google)
  const handleLike = (_reviewId: string) => {
    toast.success('Liked');
  };

  // Delete review (admin or author only)
  const handleDelete = async (reviewId: string) => {
    try {
      const res = await fetch('/api/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId }),
      });
      if (res.ok) {
        toast.success('Ulasan dihapus');
        queryClient.invalidateQueries({ queryKey: ['reviews', slug] });
      }
    } catch {
      toast.error('Gagal hapus ulasan');
    }
  };

  return (
    <div className="space-y-4">
      {/* Rating summary */}
      <div className="flex items-center gap-4 p-3 rounded-lg border border-border/60 bg-card/40">
        <div className="text-center shrink-0">
          <div className="text-3xl font-black text-amber-400">
            {avgUserScore > 0 ? avgUserScore.toFixed(1) : baseScore.toFixed(1)}
          </div>
          <div className="flex gap-0.5 justify-center my-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'h-3 w-3',
                  i < Math.round((avgUserScore || baseScore) / 2)
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-muted text-muted'
                )}
              />
            ))}
          </div>
          <div className="text-xs text-foreground/70">
            {animeReviews.length > 0
              ? `${animeReviews.length} ulasan`
              : 'Belum ada ulasan'}
          </div>
        </div>
        <div className="h-12 w-px bg-border" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-foreground/70 mb-1">Beri ratingmu:</div>
          <div className="flex gap-1">
            {Array.from({ length: 10 }).map((_, i) => {
              const val = i + 1;
              const active = (hoverRating || localRating) >= val;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLocalRating(val)}
                  onMouseEnter={() => setHoverRating(val)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-125"
                  aria-label={`Beri ${val} bintang`}
                >
                  <Star
                    className={cn(
                      'h-4 w-4 transition-colors',
                      active ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted'
                    )}
                  />
                </button>
              );
            })}
          </div>
          {localRating > 0 && (
            <div className="text-xs text-amber-400 mt-1">
              Ratingmu: {localRating}/10
            </div>
          )}
        </div>
      </div>

      {/* Add review form */}
      <form onSubmit={handleSubmit} className="space-y-2 p-3 rounded-lg border border-border/60 bg-card/40">
        <div className="text-xs font-semibold text-foreground/70 uppercase tracking-wide flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" /> Tulis Ulasan
        </div>
        {!session?.user && (
          <p className="text-xs text-amber-400">
            Login dulu buat kasih ulasan.{' '}
            <a href="/auth/login" className="underline font-semibold">Masuk di sini</a>
          </p>
        )}
        <Textarea
          placeholder={`Bagikan pendapatmu tentang ${animeTitle}…`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="text-sm min-h-[80px] resize-none"
          maxLength={500}
          disabled={!session?.user}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-foreground/70">
            {comment.length}/500 · Rating wajib
          </span>
          <Button
            type="submit"
            disabled={!comment.trim() || localRating < 1 || submitMutation.isPending || !session?.user}
            size="sm"
            className="bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
          >
            <Send className="h-3 w-3 mr-1" />
            {submitMutation.isPending ? 'Mengirim…' : 'Kirim'}
          </Button>
        </div>
      </form>

      {/* Reviews list */}
      <div>
        <div className="text-xs font-semibold text-foreground/70 uppercase tracking-wide mb-2">
          Ulasan ({animeReviews.length})
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg shimmer" />
            ))}
          </div>
        ) : animeReviews.length === 0 ? (
          <div className="text-center py-8 text-sm text-foreground/70 border border-dashed border-border/60 rounded-lg">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Belum ada ulasan. Jadilah yang pertama!
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-anichin">
            {animeReviews.map((review) => (
              <div
                key={review.id}
                className="flex items-start gap-2 p-3 rounded-lg border border-border/60 bg-card/40"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-bold text-black text-sm shrink-0">
                  {review.user.name?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{review.user.name || 'Anonim'}</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            'h-2.5 w-2.5',
                            i < Math.round(review.rating / 2)
                              ? 'fill-amber-400 text-amber-400'
                              : 'fill-muted text-muted'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-foreground/60 ml-auto">
                      {timeAgo(review.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 mt-1 line-clamp-3">{review.comment}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => handleLike(review.id)}
                      className="flex items-center gap-1 text-xs text-foreground/60 hover:text-amber-400 transition-colors"
                    >
                      <ThumbsUp className="h-3 w-3" /> {review.likes || 0}
                    </button>
                    {(((session?.user) as any)?.id === review.user.name || ((session?.user) as any)?.role === 'admin') && (
                      <button
                        onClick={() => handleDelete(review.id)}
                        className="flex items-center gap-1 text-xs text-foreground/60 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" /> Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
