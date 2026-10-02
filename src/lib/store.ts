'use client';
import { type AccentColor } from './theme-config';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Safe localStorage getter that works on both server and client
const safeLocalStorage = () =>
  typeof window !== 'undefined' ? window.localStorage : undefined;

interface BookmarkItem {
  slug: string;
  title: string;
  poster: string;
  addedAt: number;
}

interface ContinueWatchingItem {
  slug: string;
  title: string;
  poster: string;
  episodeNumber: number;
  totalEpisodes?: number;
  watchedAt: number;
  progress: number; // 0-100
}

interface ReviewItem {
  id: string;
  slug: string;
  name: string;
  rating: number; // 1-10
  comment: string;
  createdAt: number;
  likes: number;
}

interface EpisodeCommentItem {
  id: string;
  animeSlug: string;
  episodeNumber: number;
  name: string;
  comment: string;
  createdAt: number;
  likes: number;
}

interface UserRating {
  slug: string;
  rating: number; // 1-10
  ratedAt: number;
}

interface UIState {
  // Detail modal
  detailSlug: string | null;
  detailOpen: boolean;
  searchQuery: string;
  openDetail: (slug: string) => void;
  closeDetail: () => void;
  setSearchQuery: (q: string) => void;

  // Search modal
  searchModalOpen: boolean;
  openSearchModal: () => void;
  closeSearchModal: () => void;

  // Watch player modal
  watchSlug: string | null;
  watchEpisode: number | null;
  watchOpen: boolean;
  openWatch: (slug: string, episode?: number) => void;
  closeWatch: () => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (t: 'dark' | 'light') => void;

  // Customization settings (persisted)
  accentColor: AccentColor;
  setAccentColor: (c: AccentColor) => void;
  fontSize: 'sm' | 'md' | 'lg';
  setFontSize: (s: 'sm' | 'md' | 'lg') => void;
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  autoplayHero: boolean;
  setAutoplayHero: (v: boolean) => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;

  // Bookmarks (persisted)
  bookmarks: BookmarkItem[];
  toggleBookmark: (item: BookmarkItem) => void;
  isBookmarked: (slug: string) => boolean;
  removeBookmark: (slug: string) => void;
  clearBookmarks: () => void;

  // Continue watching (persisted)
  continueWatching: ContinueWatchingItem[];
  markWatched: (item: ContinueWatchingItem) => void;
  clearContinueWatching: () => void;

  // User ratings (persisted) — 1 to 10 stars
  userRatings: UserRating[];
  setRating: (slug: string, rating: number) => void;
  getRating: (slug: string) => number;
  removeRating: (slug: string) => void;

  // Reviews/comments (persisted)
  reviews: ReviewItem[];
  addReview: (review: Omit<ReviewItem, 'id' | 'createdAt' | 'likes'>) => void;
  likeReview: (id: string) => void;
  deleteReview: (id: string) => void;

  // Episode comments — jejak lokal untuk pencapaian (AchievementsWidget).
  // Daftar komentar yang tampil di modal datang dari `/api/comments`, BUKAN
  // dari sini: sebelumnya array inilah satu-satunya penyimpanan, sehingga
  // komentar tidak pernah terlihat pengguna lain.
  episodeComments: EpisodeCommentItem[];
  addEpisodeComment: (c: Omit<EpisodeCommentItem, 'id' | 'createdAt' | 'likes'>) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      detailSlug: null,
      detailOpen: false,
      searchQuery: '',
      openDetail: (slug) => set({ detailSlug: slug, detailOpen: true }),
      closeDetail: () => set({ detailSlug: null, detailOpen: false }),
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Search modal
      searchModalOpen: false,
      openSearchModal: () => set({ searchModalOpen: true }),
      closeSearchModal: () => set({ searchModalOpen: false }),

      watchSlug: null,
      watchEpisode: null,
      watchOpen: false,
      openWatch: (slug, episode) =>
        set({ watchSlug: slug, watchEpisode: episode ?? 1, watchOpen: true }),
      closeWatch: () => set({ watchSlug: null, watchEpisode: null, watchOpen: false }),

      theme: 'dark',
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (t) => set({ theme: t }),

      // Customization
      accentColor: 'amber',
      setAccentColor: (c) => set({ accentColor: c }),
      fontSize: 'md',
      setFontSize: (s) => set({ fontSize: s }),
      compactMode: false,
      setCompactMode: (v) => set({ compactMode: v }),
      autoplayHero: true,
      setAutoplayHero: (v) => set({ autoplayHero: v }),
      settingsOpen: false,
      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),

      bookmarks: [],
      toggleBookmark: (item) =>
        set((s) => {
          const exists = s.bookmarks.some((b) => b.slug === item.slug);
          return {
            bookmarks: exists
              ? s.bookmarks.filter((b) => b.slug !== item.slug)
              : [{ ...item, addedAt: Date.now() }, ...s.bookmarks].slice(0, 100),
          };
        }),
      isBookmarked: (slug) => get().bookmarks.some((b) => b.slug === slug),
      removeBookmark: (slug) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.slug !== slug) })),
      clearBookmarks: () => set({ bookmarks: [] }),

      continueWatching: [],
      markWatched: (item) =>
        set((s) => {
          const filtered = s.continueWatching.filter((c) => c.slug !== item.slug);
          return {
            continueWatching: [
              { ...item, watchedAt: Date.now(), progress: item.progress ?? 100 },
              ...filtered,
            ].slice(0, 20),
          };
        }),
      clearContinueWatching: () => set({ continueWatching: [] }),

      // User ratings
      userRatings: [],
      setRating: (slug, rating) =>
        set((s) => {
          const filtered = s.userRatings.filter((r) => r.slug !== slug);
          return {
            userRatings: [{ slug, rating, ratedAt: Date.now() }, ...filtered],
          };
        }),
      getRating: (slug) => get().userRatings.find((r) => r.slug === slug)?.rating ?? 0,
      removeRating: (slug) =>
        set((s) => ({ userRatings: s.userRatings.filter((r) => r.slug !== slug) })),

      // Reviews
      reviews: [],
      addReview: (review) =>
        set((s) => ({
          reviews: [
            {
              ...review,
              id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              createdAt: Date.now(),
              likes: 0,
            },
            ...s.reviews,
          ].slice(0, 500),
        })),
      likeReview: (id) =>
        set((s) => ({
          reviews: s.reviews.map((r) =>
            r.id === id ? { ...r, likes: r.likes + 1 } : r
          ),
        })),
      deleteReview: (id) =>
        set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) })),

      // Episode comments
      episodeComments: [],
      addEpisodeComment: (c) =>
        set((s) => ({
          episodeComments: [
            {
              ...c,
              id: `ec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              createdAt: Date.now(),
              likes: 0,
            },
            ...s.episodeComments,
          ].slice(0, 1000),
        })),
    }),
    {
      name: 'anichin-ui',
      storage: createJSONStorage(() => safeLocalStorage() as Storage),
      partialize: (s) => ({
        bookmarks: s.bookmarks,
        continueWatching: s.continueWatching,
        theme: s.theme,
        accentColor: s.accentColor,
        fontSize: s.fontSize,
        compactMode: s.compactMode,
        autoplayHero: s.autoplayHero,
        userRatings: s.userRatings,
        reviews: s.reviews,
        episodeComments: s.episodeComments,
      }),
    }
  )
);
