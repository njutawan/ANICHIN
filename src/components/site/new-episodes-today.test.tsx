// @vitest-environment jsdom
/**
 * Test P1-4: "Episode Hari Ini" tidak boleh memanggil API lagi saat data sudah
 * dirender server (`initialData`) — itulah inti pengurangan 25 `useQuery` di
 * beranda. Tanpa `initialData`, komponen tetap mengambil sendiri (fallback).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TodayPayload } from '@/lib/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/i18n-context', () => ({
  useI18n: () => ({ locale: 'id', setLocale: vi.fn(), t: (k: string) => k, locales: [] }),
}));

import { NewEpisodesToday } from './new-episodes-today';

const payload: TodayPayload = {
  episodes: [
    {
      id: 'e1',
      number: 7,
      title: 'Episode 7',
      thumbnail: '/thumb.jpg',
      duration: '24m',
      releasedAt: new Date().toISOString(),
      views: 100,
      streamUrl: null,
      anime: {
        slug: 'shadow-blade',
        title: 'Shadow Blade',
        titleJp: '影の刃',
        poster: '/anime/shadow-blade.svg',
        type: 'TV',
        status: 'Ongoing',
        releasedEpisodes: 7,
      },
    },
  ],
  total: 1,
};

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new Error('fetch tidak boleh dipanggil')));
  vi.stubGlobal('fetch', fetchSpy);
});

describe('<NewEpisodesToday />', () => {
  it('merender data dari server tanpa memanggil /api/today', async () => {
    renderWithClient(<NewEpisodesToday initialData={payload} />);

    expect(screen.getByText('Shadow Blade')).toBeDefined();
    expect(screen.getByText('EP 7')).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('tetap mengambil sendiri kalau initialData tidak diberikan (fallback)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);

    renderWithClient(<NewEpisodesToday />);

    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/today');
    });
  });
});
