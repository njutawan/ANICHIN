/**
 * Isi beranda — **server component**.
 *
 * Dipakai oleh `/` (id) dan `/en` (en) supaya kedua rute memakai jalur data
 * yang sama. Di sinilah prefetch P1-4 dikerjakan:
 *
 * 1. `prefetchHomePageData()` mengambil semua dataset homepage dari loader
 *    server yang di-cache (`src/lib/data/home.ts`) — satu query DB per
 *    dataset per TTL, bukan per kunjungan.
 * 2. Sebagian data dioper sebagai props ke komponen penting
 *    (breaking news, episode hari ini, rilisan terbaru, sidebar, statistik)
 *    agar ikut ter-render di HTML.
 * 3. Sisanya di-dehydrate lewat `<HydrationBoundary>` dengan kunci
 *    TanStack Query yang sama dengan `useQuery` di komponen, sehingga browser
 *    **tidak** memanggil API saat halaman pertama kali dibuka.
 *
 * Catatan nonce: root layout tetap `force-dynamic` (nonce CSP per-request),
 * jadi HTML tidak di-cache — yang di-cache adalah datanya.
 */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import dynamicImport from 'next/dynamic';

import { Header } from '@/components/site/header';
import { HeroSlider } from '@/components/site/hero-slider';
import { LatestUpdates } from '@/components/site/latest-updates';
import { TopRatedRail, GenreGrid } from '@/components/site/genre-grid';
import { TabbedRail } from '@/components/site/tabbed-rail';
import { AnimeBrowseSection } from '@/components/site/anime-browse';
import { Sidebar } from '@/components/site/sidebar';
import { Footer } from '@/components/site/footer';
import { BookmarkSection } from '@/components/site/bookmark-section';
import { ContinueWatching } from '@/components/site/continue-watching';
import { CollectionsSection } from '@/components/site/collections-section';
import { ScrollUtilities } from '@/components/site/scroll-utilities';
import { StructuredData } from '@/components/site/structured-data';
import { BottomNav } from '@/components/site/bottom-nav';
import { LazyModals } from '@/components/site/modal-lazy';
import { SettingsPanel } from '@/components/site/settings-panel';
import { ContentProtection } from '@/components/site/content-protection';
import { BreakingNews } from '@/components/site/breaking-news';
import { NewEpisodesToday } from '@/components/site/new-episodes-today';
import { getServerQueryClient, prefetchHomePageData } from '@/lib/home-prefetch';
import { getServerAuthSession } from '@/lib/session';

// Lazy load secondary sections — only load when user scrolls to them
const StatsBar = dynamicImport(() => import('@/components/site/stats-bar').then((m) => ({ default: m.StatsBar })));
const TrailersSection = dynamicImport(() => import('@/components/site/trailers-section').then((m) => ({ default: m.TrailersSection })));
const EditorsChoice = dynamicImport(() => import('@/components/site/editors-choice').then((m) => ({ default: m.EditorsChoice })));
const SeasonCalendar = dynamicImport(() => import('@/components/site/season-calendar').then((m) => ({ default: m.SeasonCalendar })));
const StatsDashboard = dynamicImport(() => import('@/components/site/stats-dashboard').then((m) => ({ default: m.StatsDashboard })));
const FAQSection = dynamicImport(() => import('@/components/site/faq-section').then((m) => ({ default: m.FAQSection })));
const AchievementsWidget = dynamicImport(() => import('@/components/site/achievements').then((m) => ({ default: m.AchievementsWidget })));
const WatchHistory = dynamicImport(() => import('@/components/site/watch-history').then((m) => ({ default: m.WatchHistory })));

export async function HomeContent() {
  const queryClient = getServerQueryClient();
  // Statistik dashboard memakai `/api/analytics` yang admin-only; untuk
  // pengunjung biasa request itu selalu 401 (sia-sia). Cek sesi di server dan
  // hanya render untuk admin.
  const [data, session] = await Promise.all([
    prefetchHomePageData(queryClient),
    getServerAuthSession(),
  ]);
  const isAdmin = session?.user?.role === 'admin';

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex min-h-dvh flex-col bg-background overflow-x-hidden max-w-[100vw]">
        <StructuredData />
        <ScrollUtilities />
        {/* Konten di atas lipatan: datanya dikirim sebagai props agar ada di HTML */}
        <BreakingNews initialData={data.breaking} />
        <Header />
        <main id="main-content" className="flex-1" role="main">
          {/* HERO — primary CTA, real banner images, rating + genres + synopsis */}
          <HeroSlider />

          {/* PRIMARY CONTENT — 3 key sections above the fold (reduced from 5) */}
          <div className="container-fluid">
            <ContinueWatching />
            <NewEpisodesToday initialData={data.today} />
            {/* TabbedRail merges Trending + TopAiring + TopRated into 1 section (reduces row fatigue) */}
            <TabbedRail />
          </div>

          {/* COLLECTIONS — full-width feature */}
          <div className="container-fluid">
            <CollectionsSection />
          </div>

          {/* SECONDARY CONTENT — latest updates + sidebar */}
          <div className="container-fluid grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-responsive-lg">
            <div className="min-w-0">
              <LatestUpdates initialData={data.latest} />
              <BookmarkSection />
              <EditorsChoice />
              <TrailersSection />
            </div>
            <div className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100dvh-6rem)] overflow-y-auto scrollbar-anichin lg:-mx-2 lg:px-2 z-10">
              <Sidebar initialPopular={data.popular} initialSchedule={data.schedule} />
            </div>
          </div>

          {/* TERTIARY CONTENT — lazy loaded */}
          <div className="container-fluid">
            <TopRatedRail />
            <SeasonCalendar />
            <AnimeBrowseSection />
            <GenreGrid />
            <FAQSection />
          </div>

          {/* QUATERNARY — stats + achievements (only if user engages) */}
          <div className="container-fluid">
            <StatsBar initialData={data.stats} />
            {isAdmin && <StatsDashboard />}
            <WatchHistory />
            <AchievementsWidget />
          </div>
        </main>
        <Footer />
        <BottomNav />
        <SettingsPanel />
        <ContentProtection />
        <LazyModals />
      </div>
    </HydrationBoundary>
  );
}
