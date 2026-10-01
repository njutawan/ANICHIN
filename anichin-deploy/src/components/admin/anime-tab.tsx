'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { AnimeFormDialog, type AnimeFormValues } from './anime-form-dialog';
import { ConfirmDialog } from './confirm-dialog';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Film,
  AlertCircle,
} from 'lucide-react';

interface AdminAnime {
  id: string;
  slug: string;
  title: string;
  titleJp?: string | null;
  type: string;
  status: string;
  score: number;
  views: number;
  totalEpisodes?: number | null;
  releasedEpisodes?: number | null;
  featured: boolean;
  trending: boolean;
  popular: boolean;
  episodeCount: number;
  genres: string[];
  poster: string;
  createdAt: string;
  updatedAt: string;
}

interface AnimeListResponse {
  animes: AdminAnime[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_BADGE: Record<string, string> = {
  Ongoing: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Completed: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  Upcoming: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

export function AnimeTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 10;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAnime | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryKey = useMemo(
    () => ['admin-anime', debouncedSearch, statusFilter, typeFilter, page],
    [debouncedSearch, statusFilter, typeFilter, page]
  );

  const { data, isLoading, error } = useQuery<AnimeListResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        q: debouncedSearch,
        status: statusFilter,
        type: typeFilter,
        page: String(page),
        limit: String(limit),
        sort: 'latest',
      });
      const res = await fetch(`/api/admin/anime?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Gagal memuat anime.');
      }
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/anime/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Gagal menghapus anime.');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Anime berhasil dihapus.');
      qc.invalidateQueries({ queryKey: ['admin-anime'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(a: AdminAnime) {
    setEditing(a);
    setFormOpen(true);
  }

  const editingFormValues: (Partial<AnimeFormValues> & { id?: string }) | null = editing
    ? {
        id: editing.id,
        title: editing.title,
        titleJp: editing.titleJp,
        type: editing.type,
        status: editing.status,
        score: editing.score,
        views: editing.views,
        totalEpisodes: editing.totalEpisodes,
        releasedEpisodes: editing.releasedEpisodes,
        featured: editing.featured,
        trending: editing.trending,
        popular: editing.popular,
        genres: editing.genres,
        poster: editing.poster,
      }
    : null;

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul atau slug…"
              className="pl-9"
              aria-label="Cari anime"
            />
          </div>
          <FilterSelect
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Semua Status' },
              { value: 'Ongoing', label: 'Ongoing' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Upcoming', label: 'Upcoming' },
            ]}
          />
          <FilterSelect
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Semua Tipe' },
              { value: 'TV', label: 'TV' },
              { value: 'Movie', label: 'Movie' },
              { value: 'OVA', label: 'OVA' },
              { value: 'ONA', label: 'ONA' },
              { value: 'Special', label: 'Special' },
            ]}
          />
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="size-4" />
          Tambah Anime
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          {(error as Error).message}
        </div>
      )}

      {/* Table */}
      <Card className="border-border/60 bg-card/40 overflow-hidden">
        <div className="overflow-x-auto scrollbar-anichin">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="border-b border-border/60 bg-muted/30">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Judul</th>
                <th className="px-4 py-3 font-medium">Tipe</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Skor</th>
                <th className="px-4 py-3 font-medium">Views</th>
                <th className="px-4 py-3 font-medium">Ep</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-12" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && data?.animes?.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Film className="size-10 opacity-40" />
                      <div>
                        <div className="font-medium text-foreground">Belum ada anime</div>
                        <div className="text-xs mt-1">
                          Coba ubah filter atau tambahkan anime baru.
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading &&
                data?.animes?.map((a, i) => {
                  const index = (page - 1) * limit + i + 1;
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{index}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <div className="size-9 rounded-md overflow-hidden bg-muted shrink-0">
                            <img
                              src={a.poster}
                              alt={a.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[260px]">
                              {a.title}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                              {a.titleJp || a.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{a.type}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE[a.status] || ''}
                        >
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-amber-400">
                        {a.score.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {a.views.toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {a.releasedEpisodes ?? '—'}/{a.totalEpisodes ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[160px]">
                          {a.featured && (
                            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                              Featured
                            </Badge>
                          )}
                          {a.trending && (
                            <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                              Trending
                            </Badge>
                          )}
                          {a.popular && (
                            <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30">
                              Popular
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(a)}
                            aria-label={`Edit ${a.title}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={deleteMutation.isPending}
                                aria-label={`Hapus ${a.title}`}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            }
                            title="Hapus anime?"
                            description={
                              <>
                                Anime <strong className="text-foreground">{a.title}</strong> akan
                                dihapus permanen bersama semua episode terkait. Aksi ini tidak
                                bisa dibatalkan.
                              </>
                            }
                            confirmLabel="Ya, hapus"
                            destructive
                            onConfirm={() => deleteMutation.mutateAsync(a.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && data && data.total > limit && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} dari{' '}
              {data.total} anime
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

      <AnimeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        anime={editingFormValues}
      />

      {deleteMutation.isPending && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md bg-card/95 px-3 py-2 text-sm shadow-lg border border-border">
          <Loader2 className="size-4 animate-spin" />
          Menghapus…
        </div>
      )}
    </div>
  );
}

// ── Filter select ──
function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
      aria-label="Filter"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-background text-foreground">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
