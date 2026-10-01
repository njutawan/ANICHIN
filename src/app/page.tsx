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
import dynamic from 'next/dynamic';

// Lazy load secondary sections — only load when user scrolls to them
const StatsBar = dynamic(() => import('@/components/site/stats-bar').then(m => ({ default: m.StatsBar })));
const TrailersSection = dynamic(() => import('@/components/site/trailers-section').then(m => ({ default: m.TrailersSection })));
const EditorsChoice = dynamic(() => import('@/components/site/editors-choice').then(m => ({ default: m.EditorsChoice })));
const NewEpisodesToday = dynamic(() => import('@/components/site/new-episodes-today').then(m => ({ default: m.NewEpisodesToday })));
const SeasonCalendar = dynamic(() => import('@/components/site/season-calendar').then(m => ({ default: m.SeasonCalendar })));
const StatsDashboard = dynamic(() => import('@/components/site/stats-dashboard').then(m => ({ default: m.StatsDashboard })));
const FAQSection = dynamic(() => import('@/components/site/faq-section').then(m => ({ default: m.FAQSection })));
const AchievementsWidget = dynamic(() => import('@/components/site/achievements').then(m => ({ default: m.AchievementsWidget })));
const WatchHistory = dynamic(() => import('@/components/site/watch-history').then(m => ({ default: m.WatchHistory })));

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background overflow-x-hidden max-w-[100vw]">
      <StructuredData />
      <ScrollUtilities />
      <BreakingNews />
      <Header />
      <main id="main-content" className="flex-1" role="main">
        {/* HERO — primary CTA, real banner images, rating + genres + synopsis */}
        <HeroSlider />

        {/* PRIMARY CONTENT — 3 key sections above the fold (reduced from 5) */}
        <div className="container-fluid">
          <ContinueWatching />
          <NewEpisodesToday />
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
            <LatestUpdates />
            <BookmarkSection />
            <EditorsChoice />
            <TrailersSection />
          </div>
          <div className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100dvh-6rem)] overflow-y-auto scrollbar-anichin lg:-mx-2 lg:px-2 z-10">
            <Sidebar />
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
          <StatsBar />
          <StatsDashboard />
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
  );
}
