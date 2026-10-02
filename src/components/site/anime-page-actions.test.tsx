// @vitest-environment jsdom
/**
 * Component tests untuk bagian interaktif halaman detail anime.
 *
 * Halaman `/anime/[slug]` adalah server component; interaksinya ada di dua
 * client component ini, jadi keduanya yang diuji di sini.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const storeState = {
  openWatch: vi.fn(),
  toggleBookmark: vi.fn(),
  bookmarks: [] as { slug: string }[],
  searchModalOpen: false,
  detailOpen: false,
  detailSlug: null as string | null,
  watchOpen: false,
  watchSlug: null as string | null,
  watchEpisode: null as number | null,
};

vi.mock('@/lib/store', () => ({
  useUIStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));
vi.mock('@/hooks/use-mounted', () => ({ useMounted: () => true }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/lib/site', async () => {
  const actual = await vi.importActual<typeof import('@/lib/site')>('@/lib/site');
  return { ...actual, animeUrl: (slug: string) => `https://anichin.id/anime/${slug}` };
});

import { AnimePageActions } from './anime-page-actions';
import { AnimeEpisodeList } from './anime-episode-list';

beforeEach(() => {
  vi.clearAllMocks();
  storeState.bookmarks = [];
});

describe('<AnimePageActions />', () => {
  it('membuka player pada episode pertama', async () => {
    const user = userEvent.setup();
    render(
      <AnimePageActions slug="shadow-blade" title="Shadow Blade" poster="/p.svg" firstEpisode={1} />
    );
    await user.click(screen.getByRole('button', { name: /tonton sekarang/i }));
    expect(storeState.openWatch).toHaveBeenCalledWith('shadow-blade', 1);
  });

  it('menonaktifkan tombol tonton secara fungsional saat belum ada episode', async () => {
    const user = userEvent.setup();
    render(
      <AnimePageActions slug="upcoming-x" title="Upcoming X" poster="/p.svg" firstEpisode={null} />
    );
    await user.click(screen.getByRole('button', { name: /tonton sekarang/i }));
    expect(storeState.openWatch).not.toHaveBeenCalled();
  });

  it('toggle bookmark memakai slug halaman', async () => {
    const user = userEvent.setup();
    render(
      <AnimePageActions slug="shadow-blade" title="Shadow Blade" poster="/p.svg" firstEpisode={1} />
    );
    await user.click(screen.getByRole('button', { name: /tambah ke bookmark/i }));
    expect(storeState.toggleBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'shadow-blade', title: 'Shadow Blade' })
    );
  });
});

describe('<AnimeEpisodeList />', () => {
  const episodes = [
    { id: 'e1', number: 1, title: 'Awal Mula', duration: '24 min', releasedAt: '2026-01-01T00:00:00Z', views: 1200 },
    { id: 'e2', number: 2, title: null, duration: null, releasedAt: '2026-01-08T00:00:00Z', views: 900 },
  ];

  it('merender semua episode dengan judul fallback', () => {
    render(<AnimeEpisodeList slug="shadow-blade" episodes={episodes} />);
    expect(screen.getByText('Awal Mula')).toBeInTheDocument();
    expect(screen.getByText('Episode 2')).toBeInTheDocument();
  });

  it('klik episode membuka player pada episode tersebut', async () => {
    const user = userEvent.setup();
    render(<AnimeEpisodeList slug="shadow-blade" episodes={episodes} />);
    await user.click(screen.getByText('Awal Mula'));
    expect(storeState.openWatch).toHaveBeenCalledWith('shadow-blade', 1);
  });

  it('menampilkan pesan kosong bila belum ada episode', () => {
    render(<AnimeEpisodeList slug="shadow-blade" episodes={[]} />);
    expect(screen.getByText(/episode belum tersedia/i)).toBeInTheDocument();
  });
});
