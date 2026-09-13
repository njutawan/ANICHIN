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
import { ScrollUtilities } from "@/components/site/scroll-utilities";
import { StructuredData } from "@/components/site/structured-data";
import { BreakingNews } from "@/components/site/breaking-news";
import { BottomNav } from '@/components/site/bottom-nav';
import { LazyModals } from '@/components/site/modal-lazy';
import dynamic from 'next/dynamic';

const StatsBar = dynamic(() => import('@/components/site/stats-bar').then(m => ({ default: m.StatsBar })));
const TrailersSection = dynamic(() => import('@/components/site/trailers-section').then(m => ({ default: m.TrailersSection })));
const EditorsChoice = dynamic(() => import('@/components/site/editors-choice').then(m => ({ default: m.EditorsChoice })));
const NewEpisodesToday = dynamic(() => import('@/components/site/new-episodes-today').then(m => ({ default: m.NewEpisodesToday })));
const SeasonCalendar = dynamic(() => import('@/components/site/season-calendar').then(m => ({ default: m.SeasonCalendar })));
const StatsDashboard = dynamic(() => import('@/components/site/stats-dashboard').then(m => ({ default: m.StatsDashboard })));
const FAQSection = dynamic(() => import('@/components/site/faq-section').then(m => ({ default: m.FAQSection })));
const AchievementsWidget = dynamic(() => import('@/components/site/achievements').then(m => ({ default: m.AchievementsWidget })));
const WatchHistory = dynamic(() => import('@/components/site/watch-history').then(m => ({ default: m.WatchHistory })));

/**
 * English homepage — same content as Indonesian homepage, but with English metadata.
 * The i18n system (language toggle) handles UI text translation client-side.
 * Google sees this as a separate page with English meta tags + hreflang.
 */
export default function EnHome() {
  return (
    <div className="flex min-h-dvh flex-col bg-background overflow-x-hidden max-w-[100vw]">
      <StructuredData />
      <ScrollUtilities />
      <BreakingNews />
      <Header />
      <main id="main-content" className="flex-1" role="main">
        <HeroSlider />
        <div className="container-fluid">
          <ContinueWatching />
          <NewEpisodesToday />
          <TabbedRail />
        </div>
        <div className="container-fluid">
          <CollectionsSection />
        </div>
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
        <div className="container-fluid">
          <TopRatedRail />
          <SeasonCalendar />
          <AnimeBrowseSection />
          <GenreGrid />
          <FAQSection />
        </div>
        <div className="container-fluid">
          <StatsBar />
          <StatsDashboard />
          <WatchHistory />
          <AchievementsWidget />
        </div>
      </main>
      <Footer />
      <BottomNav />
      <LazyModals />
    </div>
  );
}
