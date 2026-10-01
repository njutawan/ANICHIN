'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatsTab } from '@/components/admin/stats-tab';
import { AnimeTab } from '@/components/admin/anime-tab';
import { UsersTab } from '@/components/admin/users-tab';
import { ReviewsTab } from '@/components/admin/reviews-tab';
import { AuditLogsTab } from '@/components/admin/audit-logs-tab';
import { ShieldCheck, Film, Users, Star, FileClock } from 'lucide-react';

const TABS = [
  {
    id: 'stats',
    label: 'Statistik',
    icon: ShieldCheck,
    description: 'Ringkasan data platform',
  },
  {
    id: 'anime',
    label: 'Anime',
    icon: Film,
    description: 'Kelola katalog anime',
  },
  {
    id: 'users',
    label: 'Pengguna',
    icon: Users,
    description: 'Promosi & demosi admin',
  },
  {
    id: 'reviews',
    label: 'Ulasan',
    icon: Star,
    description: 'Moderasi ulasan pengguna',
  },
  {
    id: 'logs',
    label: 'Audit Log',
    icon: FileClock,
    description: 'Aktivitas keamanan terbaru',
  },
] as const;

export default function AdminPage() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="container-fluid py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500/15 text-amber-400 p-2.5">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                Admin Panel
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Pusat kendali AniChin — kelola anime, pengguna, ulasan, dan audit keamanan.
              </p>
            </div>
          </div>
        </header>

        <Tabs defaultValue="stats" className="gap-4">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            <TabsList className="inline-flex h-auto p-1.5 bg-card/60 border border-border/60 backdrop-blur">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap"
                  >
                    <Icon className="size-4" />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="stats" className="mt-4 animate-fade-up">
            <StatsTab />
          </TabsContent>
          <TabsContent value="anime" className="mt-4 animate-fade-up">
            <AnimeTab />
          </TabsContent>
          <TabsContent value="users" className="mt-4 animate-fade-up">
            <UsersTab />
          </TabsContent>
          <TabsContent value="reviews" className="mt-4 animate-fade-up">
            <ReviewsTab />
          </TabsContent>
          <TabsContent value="logs" className="mt-4 animate-fade-up">
            <AuditLogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
