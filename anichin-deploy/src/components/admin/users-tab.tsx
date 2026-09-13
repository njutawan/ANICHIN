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
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users as UsersIcon,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  role: 'admin' | 'user';
  emailVerified: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
  reviewCount: number;
  commentCount: number;
}

interface UsersListResponse {
  users: AdminUser[];
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

export function UsersTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 15;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryKey = useMemo(
    () => ['admin-users', debouncedSearch, roleFilter, page],
    [debouncedSearch, roleFilter, page]
  );

  const { data, isLoading, error } = useQuery<UsersListResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        q: debouncedSearch,
        role: roleFilter,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Gagal memuat pengguna.');
      }
      return res.json();
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'user' }) => {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Gagal memperbarui role.');
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.role === 'admin'
          ? 'Pengguna dipromosikan menjadi admin.'
          : 'Admin diturunkan menjadi user biasa.'
      );
      qc.invalidateQueries({ queryKey: ['admin-users'] });
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
            placeholder="Cari email atau nama…"
            className="pl-9"
            aria-label="Cari pengguna"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
          aria-label="Filter role"
        >
          <option value="all" className="bg-background text-foreground">Semua Role</option>
          <option value="admin" className="bg-background text-foreground">Admin</option>
          <option value="user" className="bg-background text-foreground">User</option>
        </select>
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
                <th className="px-4 py-3 font-medium">Pengguna</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Verifikasi</th>
                <th className="px-4 py-3 font-medium">2FA</th>
                <th className="px-4 py-3 font-medium">Ulasan</th>
                <th className="px-4 py-3 font-medium">Komentar</th>
                <th className="px-4 py-3 font-medium">Bergabung</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-20" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && data?.users?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <UsersIcon className="size-10 opacity-40" />
                      <div>
                        <div className="font-medium text-foreground">Belum ada pengguna</div>
                        <div className="text-xs mt-1">
                          Belum ada pengguna terdaftar atau tidak ada yang cocok dengan filter.
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading &&
                data?.users?.map((u) => {
                  const isAdmin = u.role === 'admin';
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <Avatar className="size-9">
                            {u.avatar ? (
                              <AvatarImage src={u.avatar} alt={u.name} />
                            ) : null}
                            <AvatarFallback className="bg-muted text-xs">
                              {initials(u.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[240px]">{u.name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[240px]">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
                            <ShieldCheck className="size-3" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Shield className="size-3" />
                            User
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.emailVerified ? (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                            Terverifikasi
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                            Belum
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.twoFactorEnabled ? (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                            Aktif
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{u.reviewCount}</td>
                      <td className="px-4 py-3 tabular-nums">{u.commentCount}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString('id-ID', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {isAdmin ? (
                            <ConfirmDialog
                              trigger={
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={roleMutation.isPending}
                                  className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                                >
                                  <ShieldAlert className="size-4" />
                                  Turunkan
                                </Button>
                              }
                              title="Turunkan admin?"
                              description={
                                <>
                                  Pengguna <strong className="text-foreground">{u.name}</strong> akan
                                  kehilangan akses admin. Mereka tidak bisa lagi mengakses panel
                                  admin.
                                </>
                              }
                              confirmLabel="Ya, turunkan"
                              destructive
                              onConfirm={() =>
                                roleMutation.mutateAsync({ userId: u.id, role: 'user' })
                              }
                            />
                          ) : (
                            <ConfirmDialog
                              trigger={
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={roleMutation.isPending}
                                  className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                >
                                  <ShieldCheck className="size-4" />
                                  Promosikan
                                </Button>
                              }
                              title="Promosikan ke admin?"
                              description={
                                <>
                                  Pengguna <strong className="text-foreground">{u.name}</strong> akan
                                  mendapat akses penuh ke panel admin — termasuk hapus anime,
                                  moderasi ulasan, dan kelola pengguna lain.
                                </>
                              }
                              confirmLabel="Ya, promosikan"
                              onConfirm={() =>
                                roleMutation.mutateAsync({ userId: u.id, role: 'admin' })
                              }
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!isLoading && data && data.total > limit && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} dari{' '}
              {data.total} pengguna
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
