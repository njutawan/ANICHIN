'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { useState } from 'react';

interface AuditLogEntry {
  timestamp?: string;
  level?: string;
  event?: string;
  route?: string;
  method?: string;
  ipHash?: string;
  statusCode?: number;
  message?: string;
  metadata?: Record<string, string | number | boolean>;
}

interface AuditLogsResponse {
  logs: AuditLogEntry[];
  total: number;
  file?: string;
}

const LEVEL_BADGE: Record<string, string> = {
  info: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  warn: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  error: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  critical: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
};

export function AuditLogsTab() {
  const [filter, setFilter] = useState('all');

  const { data, isLoading, error, refetch, isFetching } = useQuery<AuditLogsResponse>({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs?limit=100');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Gagal memuat audit log.');
      }
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  const allLogs = data?.logs ?? [];
  const filteredLogs =
    filter === 'all' ? allLogs : allLogs.filter((l) => l.level === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {['all', 'info', 'warn', 'error', 'critical'].map((lv) => (
            <Button
              key={lv}
              size="sm"
              variant={filter === lv ? 'default' : 'outline'}
              onClick={() => setFilter(lv)}
              className="capitalize"
            >
              {lv === 'all' ? 'Semua Level' : lv}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          {(error as Error).message}
        </div>
      )}

      <Card className="border-border/60 bg-card/40 overflow-hidden">
        <div className="overflow-x-auto scrollbar-anichin">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="border-b border-border/60 bg-muted/30">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Waktu</th>
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">IP Hash</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Pesan</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-20" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <FileText className="size-10 opacity-40" />
                      <div>
                        <div className="font-medium text-foreground">Belum ada log</div>
                        <div className="text-xs mt-1">
                          {filter === 'all'
                            ? 'Audit log masih kosong — aktivitas admin akan tampil di sini.'
                            : `Tidak ada log dengan level "${filter}".`}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading &&
                filteredLogs.map((log, i) => {
                  const ts = log.timestamp ? new Date(log.timestamp) : null;
                  return (
                    <tr
                      key={`${log.timestamp}-${i}`}
                      className="border-b border-border/40 hover:bg-muted/30 transition-colors align-top"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {ts
                          ? ts.toLocaleString('id-ID', {
                              year: 'numeric',
                              month: 'short',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={LEVEL_BADGE[log.level ?? 'info'] || ''}
                        >
                          {log.level ?? 'info'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs">{log.event ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-foreground/80">
                          {log.route ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {log.method ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {log.ipHash ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {log.ipHash.slice(0, 12)}…
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs">
                        {log.statusCode ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-md text-xs text-foreground/80 line-clamp-2">
                          {log.message ?? ''}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      {!isLoading && data && (
        <div className="text-xs text-muted-foreground">
          {data.total} entri ditampilkan. Sumber:{' '}
          <code className="font-mono">{data.file}</code>
        </div>
      )}
    </div>
  );
}
