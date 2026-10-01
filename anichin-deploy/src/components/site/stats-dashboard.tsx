'use client';
import { useI18n } from '@/lib/i18n-context';

import { AnimeImage } from './anime-image';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  BarChart3, PieChart as PieIcon, Trophy, Building2, TrendingUp, Award, Eye, Star,
} from 'lucide-react';
import { SectionHeading } from './latest-updates';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatViews } from '@/lib/types';
import { useMounted } from '@/hooks/use-mounted';

interface AnalyticsData {
  genreDist: { name: string; slug: string; count: number }[];
  studioBoard: {
    name: string; count: number; totalViews: number; avgScore: number;
    topAnime: { slug: string; title: string; poster: string; score: number };
  }[];
  typeDist: { name: string; value: number }[];
  scoreDist: { range: string; count: number }[];
  top10: {
    slug: string; title: string; titleJp: string | null; poster: string;
    score: number; views: number; type: string; rank: number | null;
  }[];
  statusDist: { name: string; value: number; color: string }[];
  seasonDist: { name: string; count: number }[];
}

const CHART_COLORS = ['#fbbf24', '#ef4444', '#22d3ee', '#a78bfa', '#fb923c', '#4ade80', '#f472b6', '#60a5fa', '#facc15', '#c084fc'];

export function StatsDashboard() {
  const { t } = useI18n();
  const mounted = useMounted();
  const openDetail = useUIStore((s) => s.openDetail);
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => {
      const res = await fetch('/api/analytics');
      if (!res.ok) throw new Error('analytics');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const a: AnalyticsData | undefined = data;
  const showCharts = mounted && !!a;

  return (
    <section id="dashboard" className="py-8 scroll-mt-24">
      <SectionHeading
        title={t("stats.title")}
        subtitle="Data katalog anime"
        icon={BarChart3}
      />

      {isLoading || !a ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {/* Top 10 Leaderboard */}
          <ChartCard title="Top 10 Terpopuler" icon={Trophy} className="md:col-span-2">
            <div className="space-y-2">
              {a.top10.map((anime, i) => (
                <button
                  key={anime.slug}
                  onClick={() => openDetail(anime.slug)}
                  className="group w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/60 transition-colors text-left"
                >
                  <span className={cn(
                    'shrink-0 w-7 text-center font-black text-lg',
                    i === 0 ? 'text-brand' : i === 1 ? 'text-amber-400' : i === 2 ? 'text-orange-400' : 'text-muted-foreground'
                  )}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate group-hover:text-brand transition-colors">{anime.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="flex items-center gap-0.5"><Star className="h-2.5 w-2.5 text-brand fill-brand" />{anime.score.toFixed(1)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{formatViews(anime.views)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 w-24 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand to-amber-500"
                      style={{ width: `${(anime.views / a.top10[0].views) * 100}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </ChartCard>

          {/* Genre Distribution Bar Chart */}
          <ChartCard title="Sebaran Genre" icon={BarChart3}>
            {showCharts && (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.genreDist} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={70} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'var(--secondary)', opacity: 0.3 }}
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#fbbf24" radius={[0, 4, 4, 0]} name="Anime" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          {/* Type Distribution Donut Chart (custom SVG) */}
          <ChartCard title="Sebaran Tipe" icon={PieIcon}>
            {showCharts && (
              <div className="flex flex-col items-center gap-3" style={{ height: 280 }}>
                <div className="relative w-44 h-44">
                  {(() => {
                    const total = a.typeDist.reduce((s, t) => s + t.value, 0);
                    let offset = 0;
                    const radius = 60;
                    const circumference = 2 * Math.PI * radius;
                    return (
                      <>
                        <svg className="w-44 h-44 -rotate-90" viewBox="0 0 160 160">
                          <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--secondary)" strokeWidth="16" />
                          {a.typeDist.map((t, i) => {
                            const pct = total > 0 ? t.value / total : 0;
                            const dash = pct * circumference;
                            const elem = (
                              <circle
                                key={i}
                                cx="80" cy="80" r={radius} fill="none"
                                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                strokeWidth="16"
                                strokeDasharray={`${dash} ${circumference - dash}`}
                                strokeDashoffset={-offset}
                                strokeLinecap="butt"
                              />
                            );
                            offset += dash;
                            return elem;
                          })}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-black">{total}</span>
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Total</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {a.typeDist.map((t, i) => (
                    <div key={t.name} className="flex items-center gap-1.5 text-xs">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="font-medium">{t.name}</span>
                      <span className="text-muted-foreground">({t.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

          {/* Studio Leaderboard */}
          <ChartCard title="Peringkat Studio" icon={Building2} className="md:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {a.studioBoard.map((studio, i) => (
                <div key={studio.name} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-card/40 hover:border-brand/40 transition-colors">
                  <span className={cn(
                    'shrink-0 w-6 text-center font-black',
                    i === 0 ? 'text-brand' : 'text-muted-foreground'
                  )}>{i + 1}</span>
                  {studio.topAnime && (
                    <AnimeImage src={studio.topAnime.poster} alt="" className="h-10 w-7 rounded object-cover border border-border/60 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{studio.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{studio.count} anime</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5"><Star className="h-2.5 w-2.5 text-brand fill-brand" />{studio.avgScore.toFixed(1)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{formatViews(studio.totalViews)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Score Distribution */}
          <ChartCard title="Sebaran Skor" icon={Award}>
            {showCharts && (
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.scoreDist} margin={{ left: 0, right: 20, top: 20 }}>
                    <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'var(--secondary)', opacity: 0.3 }}
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#a78bfa" radius={[4, 4, 0, 0]} name="Anime" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          {/* Status Distribution */}
          <ChartCard title="Status Tayang" icon={TrendingUp}>
            <div className="flex items-center justify-around gap-4 h-[200px] flex-wrap">
              {a.statusDist.map((s) => (
                <div key={s.name} className="text-center">
                  <div className="relative inline-flex items-center justify-center">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--secondary)" strokeWidth="8" />
                      <circle
                        cx="50" cy="50" r="40" fill="none" stroke={s.color} strokeWidth="8"
                        strokeDasharray={`${(s.value / 60) * 251.2} 251.2`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute text-2xl font-black">{s.value}</div>
                  </div>
                  <div className="text-xs font-semibold mt-2">{s.name}</div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      )}
    </section>
  );
}

function ChartCard({
  title,
  icon: Icon,
  className,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border border-border/60 bg-card/40 p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
