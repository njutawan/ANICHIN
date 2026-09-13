'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ConfirmDialog } from './confirm-dialog';
import {
  Search,
  Trash2,
  Star,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface AdminReview {
  id: string;
  animeSlug: string;
  rating: number;
  comment: string;
  likes: number;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
  };
}

interface ReviewsListResponse {
  reviews: AdminReview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .filter(Boolean)
    .join('')
    .toUpperCase();
}

function relativeTime(date: string): string {
  const now = Date.now();
  const t = new Date(date).getTime();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return new Date(date).toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ReviewsTab() {
  const qc = useQueryClient();
  const [animeSlugFilter, setAnimeSlugFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryKey = useMemo(
    () => ['admin-reviews', debouncedSearch, animeSlugFilter, page],
    [debouncedSearch, animeSlugFilter, page]
  );

  const { data, isLoading, error } = useQuery<ReviewsListResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        q: debouncedSearch,
        animeSlug: animeSlugFilter,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/admin/reviews?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Gagal memuat ulasan.');
      }
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const res = await fetch(`/api/admin/reviews?id=${encodeURIComponent(reviewId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Gagal menghapus ulasan.');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Ulasan dihapus (moderasi).');
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari isi ulasan…"
            className="pl-9"
            aria-label="Cari ulasan"
          />
        </div>
        <Input
          value={animeSlugFilter}
          onChange={(e) => {
            setAnimeSlugFilter(e.target.value.trim());
            setPage(1);
          }}
          placeholder="Filter berdasarkan slug anime…"
          className="sm:max-w-xs"
          aria-label="Filter slug anime"
        />
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          {(error as Error).message}
        </div>
      )}

      <Card className="border-border/60 bg-card/40 overflow-hidden">
        <div className="overflow-x-auto scrollbar-anichin">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="border-b border-border/60 bg-muted/30">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Penulis</th>
                <th className="px-4 py-3 font-medium">Anime</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Komentar</th>
                <th className="px-4 py-3 font-medium">Likes</th>
                <th className="px-4 py-3 font-medium">Dibuat</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-24" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && data?.reviews?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <MessageSquare className="size-10 opacity-40" />
                      <div>
                        <div className="font-medium text-foreground">Belum ada ulasan</div>
                        <div className="text-xs mt-1">
                          Belum ada ulasan atau tidak ada yang cocok dengan filter.
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading &&
                data?.reviews?.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <Avatar className="size-8">
                          {r.user.avatar ? (
                            <AvatarImage src={r.user.avatar} alt={r.user.name} />
                          ) : null}
                          <AvatarFallback className="bg-muted text-xs">
                            {initials(r.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium truncate max-w-[180px]">{r.user.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {r.user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-mono text-xs">
                        {r.animeSlug}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-semibold tabular-nums">{r.rating}</span>
                        <span className="text-muted-foreground text-xs">/10</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-md text-sm text-foreground/80 line-clamp-2">
                        {r.comment}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.likes}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ConfirmDialog
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={deleteMutation.isPending}
                              aria-label="Hapus ulasan"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          }
                          title="Hapus ulasan?"
                          description="Ulasan akan dihapus permanen. Aksi moderasi ini tidak bisa dibatalkan."
                          confirmLabel="Ya, hapus"
                          destructive
                          onConfirm={() => deleteMutation.mutateAsync(r.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!isLoading && data && data.total > limit && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} dari{' '}
              {data.total} ulasan
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <div className="px-3 text-sm tabular-nums">
                {page} / {totalPages}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
