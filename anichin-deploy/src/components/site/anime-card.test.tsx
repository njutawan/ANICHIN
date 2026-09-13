// @vitest-environment jsdom
/**
 * Component tests for <AnimeCard />.
 *
 * Covers:
 *   - Renders the anime title (line-clamped h3)
 *   - Shows the score badge (formatted to 1 decimal place)
 *   - Shows the type badge (uppercase CSS, raw text unchanged in DOM)
 *   - Bookmark button toggles on click (calls toggleBookmark + shows toast)
 *   - Clicking the card body calls openDetail(slug)
 *
 * Mocks:
 *   - @/lib/store  → useUIStore as a selector-stub returning controllable state
 *   - @/hooks/use-mounted → always returns true (skip hydration dance)
 *   - ./anime-image → plain <img> (avoids next/image + Buffer complications)
 *   - sonner → spy on toast.success to assert call args
 *   - lucide-react → real (lightweight svg components render fine in jsdom)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnimeCardData } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Stub store: each call to useUIStore(selector) returns selector(state).
// Tests mutate `storeState` then re-render to verify different scenarios.
const { storeState } = vi.hoisted(() => ({
  storeState: {
    openDetail: vi.fn(),
    openWatch: vi.fn(),
    toggleBookmark: vi.fn(),
    bookmarks: [] as Array<{ slug: string; title: string; poster: string; addedAt: number }>,
  },
}));

vi.mock('@/lib/store', () => ({
  useUIStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}));

vi.mock('@/components/site/anime-image', () => ({
  AnimeImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} data-testid="anime-image" />
  ),
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: toastMock }));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAnime(overrides: Partial<AnimeCardData> = {}): AnimeCardData {
  return {
    id: '1',
    slug: 'neon-samurai',
    title: 'Neon Samurai',
    titleEn: 'Neon Samurai',
    titleJp: 'ネオン侍',
    poster: '/anime/poster-neon-samurai.svg',
    type: 'TV',
    status: 'Ongoing',
    studio: 'Studio Test',
    releasedYear: 2024,
    season: 'Fall',
    score: 8.5,
    rating: 'Teen',
    views: 1_234_567,
    duration: '24 min',
    airedDay: 'Saturday',
    featured: false,
    trending: false,
    popular: false,
    rank: 1,
    totalEpisodes: 12,
    releasedEpisodes: 8,
    genres: ['Action', 'Sci-Fi', 'Cyberpunk'],
    synopsis: 'A test synopsis.',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

import { AnimeCard } from './anime-card';

describe('<AnimeCard />', () => {
  beforeEach(() => {
    storeState.openDetail = vi.fn();
    storeState.openWatch = vi.fn();
    storeState.toggleBookmark = vi.fn();
    storeState.bookmarks = [];
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  it('renders the anime title', () => {
    const anime = makeAnime({ title: 'Crimson Blade' });
    render(<AnimeCard anime={anime} />);
    expect(screen.getByText('Crimson Blade')).toBeInTheDocument();
  });

  it('renders the Japanese subtitle when present', () => {
    const anime = makeAnime({ titleJp: 'クリムゾンブレード' });
    render(<AnimeCard anime={anime} />);
    expect(screen.getByText('クリムゾンブレード')).toBeInTheDocument();
  });

  it('shows the score badge formatted to one decimal', () => {
    const anime = makeAnime({ score: 9.25 });
    render(<AnimeCard anime={anime} />);
    // 9.25.toFixed(1) = "9.3" (rounds)
    expect(screen.getByText('9.3')).toBeInTheDocument();
  });

  it('shows the type badge', () => {
    const anime = makeAnime({ type: 'Movie' });
    render(<AnimeCard anime={anime} />);
    // Type badge text is the raw type (uppercase is CSS-only).
    expect(screen.getByText('Movie')).toBeInTheDocument();
  });

  it('shows the ongoing status badge', () => {
    const anime = makeAnime({ status: 'Ongoing' });
    render(<AnimeCard anime={anime} />);
    expect(screen.getByText(/Ongoing/)).toBeInTheDocument();
  });

  it('shows the episode count badge when releasedEpisodes is set', () => {
    const anime = makeAnime({ releasedEpisodes: 8 });
    render(<AnimeCard anime={anime} />);
    expect(screen.getByText('EP 8')).toBeInTheDocument();
  });

  it('renders the first genre chips', () => {
    const anime = makeAnime({ genres: ['Action', 'Sci-Fi', 'Cyberpunk'] });
    render(<AnimeCard anime={anime} />);
    // Non-featured cards show only the first 2 genres.
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
  });

  describe('bookmark button', () => {
    it('is labelled "Tambah ke bookmark" when not bookmarked', () => {
      const anime = makeAnime();
      render(<AnimeCard anime={anime} />);
      const btn = screen.getByRole('button', { name: /tambah ke bookmark/i });
      expect(btn).toBeInTheDocument();
    });

    it('calls toggleBookmark with the anime item and shows "Tersimpan" toast on click', async () => {
      const user = userEvent.setup();
      const anime = makeAnime({ title: 'Phantom Detective', poster: '/p.svg' });
      render(<AnimeCard anime={anime} />);
      const btn = screen.getByRole('button', { name: /tambah ke bookmark/i });

      await user.click(btn);

      expect(storeState.toggleBookmark).toHaveBeenCalledTimes(1);
      expect(storeState.toggleBookmark).toHaveBeenCalledWith({
        slug: 'neon-samurai',
        title: 'Phantom Detective',
        poster: '/p.svg',
        addedAt: expect.any(Number),
      });
      expect(toastMock.success).toHaveBeenCalledWith(
        'Tersimpan',
        expect.objectContaining({ description: 'Phantom Detective' })
      );
    });

    it('is labelled "Hapus dari bookmark" and shows removal toast when already bookmarked', async () => {
      const user = userEvent.setup();
      const anime = makeAnime({ title: 'Phantom Detective', poster: '/p.svg' });
      storeState.bookmarks = [
        { slug: 'neon-samurai', title: 'Phantom Detective', poster: '/p.svg', addedAt: 1 },
      ];

      render(<AnimeCard anime={anime} />);
      const btn = screen.getByRole('button', { name: /hapus dari bookmark/i });
      expect(btn).toBeInTheDocument();

      await user.click(btn);

      expect(storeState.toggleBookmark).toHaveBeenCalledTimes(1);
      expect(toastMock.success).toHaveBeenCalledWith(
        'Bookmark dihapus',
        expect.objectContaining({ description: 'Phantom Detective' })
      );
    });

    it('does NOT call openDetail when the bookmark button is clicked (stopPropagation)', async () => {
      const user = userEvent.setup();
      const anime = makeAnime();
      render(<AnimeCard anime={anime} />);
      const btn = screen.getByRole('button', { name: /bookmark/i });

      await user.click(btn);

      expect(storeState.openDetail).not.toHaveBeenCalled();
    });
  });

  describe('card click', () => {
    it('calls openDetail with the slug when the card body is clicked', async () => {
      const user = userEvent.setup();
      const anime = makeAnime({ slug: 'frost-wizard', title: 'Frost Wizard' });
      render(<AnimeCard anime={anime} />);

      // Clicking the title (an h3 child of <article>) bubbles up to the article's onClick.
      await user.click(screen.getByText('Frost Wizard'));

      expect(storeState.openDetail).toHaveBeenCalledTimes(1);
      expect(storeState.openDetail).toHaveBeenCalledWith('frost-wizard');
    });
  });

  describe('rank ribbon', () => {
    it('shows rank ribbon when showRank is provided', () => {
      const anime = makeAnime();
      render(<AnimeCard anime={anime} showRank={3} />);
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    it('does not show rank ribbon when showRank is omitted', () => {
      const anime = makeAnime();
      render(<AnimeCard anime={anime} />);
      expect(screen.queryByText(/^#\d+$/)).not.toBeInTheDocument();
    });
  });
});
