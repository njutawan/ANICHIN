'use client';

import { useUIStore } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import {
  Trophy, Star, Bookmark, MessageSquare, Eye, Flame, Crown, Award, Zap, Target, CheckCircle2, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeading } from './latest-updates';

interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  check: (s: AchievementState) => boolean;
  progress?: (s: AchievementState) => { current: number; target: number };
}

interface AchievementState {
  bookmarkCount: number;
  reviewCount: number;
  commentCount: number;
  continueCount: number;
  ratingCount: number;
}

const TIER_COLORS: Record<string, string> = {
  bronze: 'from-orange-700/30 to-orange-900/10 border-orange-700/40 text-orange-400',
  silver: 'from-slate-400/30 to-slate-600/10 border-slate-400/40 text-slate-300',
  gold: 'from-amber-400/30 to-amber-600/10 border-amber-400/40 text-amber-400',
  platinum: 'from-cyan-400/30 to-purple-500/10 border-cyan-400/40 text-cyan-300',
};

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-bookmark',
    title: 'Kolektor Pemula',
    desc: 'Bookmark anime pertamamu',
    icon: Bookmark,
    tier: 'bronze',
    check: (s) => s.bookmarkCount >= 1,
    progress: (s) => ({ current: Math.min(s.bookmarkCount, 1), target: 1 }),
  },
  {
    id: 'collector',
    title: 'Kolektor Sejati',
    desc: 'Bookmark 5 anime',
    icon: Trophy,
    tier: 'silver',
    check: (s) => s.bookmarkCount >= 5,
    progress: (s) => ({ current: Math.min(s.bookmarkCount, 5), target: 5 }),
  },
  {
    id: 'master-collector',
    title: 'Master Kolektor',
    desc: 'Bookmark 10 anime',
    icon: Crown,
    tier: 'gold',
    check: (s) => s.bookmarkCount >= 10,
    progress: (s) => ({ current: Math.min(s.bookmarkCount, 10), target: 10 }),
  },
  {
    id: 'first-review',
    title: 'Kritikus Pemula',
    desc: 'Tulis ulasan pertamamu',
    icon: Star,
    tier: 'bronze',
    check: (s) => s.reviewCount >= 1,
    progress: (s) => ({ current: Math.min(s.reviewCount, 1), target: 1 }),
  },
  {
    id: 'prolific-reviewer',
    title: 'Kritikus Produktif',
    desc: 'Tulis 5 ulasan',
    icon: Award,
    tier: 'silver',
    check: (s) => s.reviewCount >= 5,
    progress: (s) => ({ current: Math.min(s.reviewCount, 5), target: 5 }),
  },
  {
    id: 'first-comment',
    title: 'Berkomentar',
    desc: 'Kasih komentar pertama',
    icon: MessageSquare,
    tier: 'bronze',
    check: (s) => s.commentCount >= 1,
    progress: (s) => ({ current: Math.min(s.commentCount, 1), target: 1 }),
  },
  {
    id: 'active-commenter',
    title: 'Komentator Aktif',
    desc: 'Kasih 10 komentar',
    icon: Zap,
    tier: 'silver',
    check: (s) => s.commentCount >= 10,
    progress: (s) => ({ current: Math.min(s.commentCount, 10), target: 10 }),
  },
  {
    id: 'binge-watcher',
    title: 'Maraton Anime',
    desc: 'Tonton 3 episode',
    icon: Eye,
    tier: 'bronze',
    check: (s) => s.continueCount >= 3,
    progress: (s) => ({ current: Math.min(s.continueCount, 3), target: 3 }),
  },
  {
    id: 'dedicated-watcher',
    title: 'Penonton Setia',
    desc: 'Tonton 10 episode',
    icon: Flame,
    tier: 'silver',
    check: (s) => s.continueCount >= 10,
    progress: (s) => ({ current: Math.min(s.continueCount, 10), target: 10 }),
  },
  {
    id: 'rater',
    title: 'Penilai',
    desc: 'Beri rating pada 5 anime',
    icon: Target,
    tier: 'silver',
    check: (s) => s.ratingCount >= 5,
    progress: (s) => ({ current: Math.min(s.ratingCount, 5), target: 5 }),
  },
  {
    id: 'completionist',
    title: 'Sang Penyelesai',
    desc: 'Raih semua pencapaian lain',
    icon: Crown,
    tier: 'platinum',
    check: (s) =>
      s.bookmarkCount >= 10 && s.reviewCount >= 5 && s.commentCount >= 10 && s.continueCount >= 10 && s.ratingCount >= 5,
  },
];

export function AchievementsWidget() {
  const mounted = useMounted();
  const bookmarks = useUIStore((s) => s.bookmarks);
  const reviews = useUIStore((s) => s.reviews);
  const episodeComments = useUIStore((s) => s.episodeComments);
  const continueWatching = useUIStore((s) => s.continueWatching);
  const userRatings = useUIStore((s) => s.userRatings);

  if (!mounted) return null;

  const state: AchievementState = {
    bookmarkCount: bookmarks.length,
    reviewCount: reviews.length,
    commentCount: episodeComments.length,
    continueCount: continueWatching.length,
    ratingCount: userRatings.length,
  };

  const unlocked = ACHIEVEMENTS.filter((a) => a.check(state));
  const locked = ACHIEVEMENTS.filter((a) => !a.check(state));
  const totalUnlocked = unlocked.length;
  const totalProgress = Math.round((totalUnlocked / ACHIEVEMENTS.length) * 100);

  return (
    <section id="achievements" className="py-8 scroll-mt-24">
      <SectionHeading
        title="Pencapaian"
        subtitle={`${totalUnlocked}/${ACHIEVEMENTS.length} pencapaian terbuka · ${totalProgress}% selesai`}
        icon={Trophy}
      />

      {/* Progress overview */}
      <div className="mt-5 rounded-xl border border-border/60 bg-gradient-to-r from-brand/10 via-transparent to-brand/10 p-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-brand/20 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-brand" />
            </div>
            <div>
              <div className="text-sm font-bold">Peringkat: {getRank(totalUnlocked)}</div>
              <div className="text-xs text-muted-foreground">
                {totalUnlocked} pencapaian · {state.bookmarkCount} bookmark · {state.reviewCount} ulasan
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-brand">{totalProgress}%</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Selesai</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand to-amber-500 transition-all duration-500"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
      </div>

      {/* Achievements grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
        {/* Unlocked first */}
        {unlocked.map((a, i) => (
          <AchievementCard key={a.id} achievement={a} unlocked={true} state={state} delay={i * 50} />
        ))}
        {/* Then locked */}
        {locked.map((a, i) => (
          <AchievementCard key={a.id} achievement={a} unlocked={false} state={state} delay={(unlocked.length + i) * 30} />
        ))}
      </div>
    </section>
  );
}

function AchievementCard({
  achievement,
  unlocked,
  state,
  delay,
}: {
  achievement: Achievement;
  unlocked: boolean;
  state: AchievementState;
  delay: number;
}) {
  const { icon: Icon, tier, title, desc } = achievement;
  const progress = achievement.progress?.(state);

  return (
    <div
      className={cn(
        'relative rounded-xl border p-3 transition-all overflow-hidden',
        unlocked
          ? cn('bg-gradient-to-br', TIER_COLORS[tier])
          : 'bg-card/40 border-border/60 opacity-60'
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {unlocked && (
        <div className="absolute top-2 right-2">
          <CheckCircle2 className="h-4 w-4 text-brand" />
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn(
          'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
          unlocked ? 'bg-black/20' : 'bg-secondary'
        )}>
          {unlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="min-w-0">
          <div className={cn('text-xs font-bold truncate', unlocked && '')}>{title}</div>
          <div className="text-xs uppercase tracking-wider opacity-70">{tier}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{desc}</p>
      {progress && !unlocked && (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
            <span>{progress.current}/{progress.target}</span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-brand"
              style={{ width: `${Math.min(100, (progress.current / progress.target) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function getRank(unlocked: number): string {
  if (unlocked >= 11) return 'AniChin Legend';
  if (unlocked >= 9) return 'Anime Master';
  if (unlocked >= 7) return 'Anime Expert';
  if (unlocked >= 5) return 'Anime Enthusiast';
  if (unlocked >= 3) return 'Anime Fan';
  if (unlocked >= 1) return 'Anime Novice';
  return 'Newcomer';
}
