// @vitest-environment jsdom
/**
 * Regresi tombol "Hapus" pada daftar ulasan.
 *
 * Bug yang dikunci di sini:
 *   1. Syarat tampil tombol membandingkan `session.user.id` dengan
 *      `review.user.name` (`as any`) sehingga penulis ulasan **tidak pernah**
 *      melihat tombolnya — hanya admin.
 *   2. Handler-nya memanggil `DELETE /api/reviews` (endpoint yang tidak ada)
 *      dan mengabaikan respons gagal tanpa pesan apa pun.
 *
 * Sekarang: tombol tampil untuk pemilik (`review.userId`) atau admin, memanggil
 * `/api/reviews/[id]`, dan setiap kegagalan memunculkan toast error.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { sessionMock, toastMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('next-auth/react', () => ({ useSession: sessionMock }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { ReviewsTab } from './reviews-tab';

const MY_REVIEW = {
  id: 'r-mine',
  userId: 'user-1',
  rating: 9,
  comment: 'Animasi luar biasa, soundtracknya juara.',
  likes: 0,
  createdAt: new Date().toISOString(),
  user: { name: 'Tester', avatar: null },
};

const OTHER_REVIEW = {
  id: 'r-other',
  userId: 'user-2',
  rating: 7,
  comment: 'Ceritanya agak lambat di tengah.',
  likes: 2,
  createdAt: new Date().toISOString(),
  user: { name: 'Budi', avatar: null },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewsTab slug="shadow-blade" animeTitle="Shadow Blade" baseScore={9.2} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockReturnValue({
    data: { user: { id: 'user-1', name: 'Tester', role: 'user' } },
    status: 'authenticated',
  });
});

describe('<ReviewsTab /> — hapus ulasan', () => {
  it('menampilkan tombol Hapus hanya untuk ulasan sendiri, lalu memanggil endpoint [id]', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(jsonResponse({ reviews: [MY_REVIEW, OTHER_REVIEW] }))
      .mockReturnValueOnce(jsonResponse({ ok: true, id: 'r-mine' }))
      .mockReturnValueOnce(jsonResponse({ reviews: [OTHER_REVIEW] }));

    global.fetch = fetchMock;

    renderTab();

    // Hanya satu tombol Hapus: milik sendiri (bukan `review.user.name` ⨯ id).
    expect(await screen.findByText('Animasi luar biasa, soundtracknya juara.')).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole('button', { name: /hapus/i });
    expect(deleteButtons).toHaveLength(1);

    await user.click(deleteButtons[0]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/reviews/r-mine', { method: 'DELETE' })
    );
    expect(toastMock.success).toHaveBeenCalledWith('Ulasan dihapus');
  });

  it('menampilkan pesan error kalau server menolak (bukan diam-diam gagal)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(jsonResponse({ reviews: [MY_REVIEW] }))
      .mockReturnValueOnce(jsonResponse({ error: 'Kamu hanya bisa menghapus ulasan sendiri.' }, 403));

    global.fetch = fetchMock;

    renderTab();

    const button = await screen.findByRole('button', { name: /hapus/i });
    await user.click(button);

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Kamu hanya bisa menghapus ulasan sendiri.')
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('admin melihat tombol Hapus untuk ulasan orang lain', async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: 'admin-1', name: 'Admin', role: 'admin' } },
      status: 'authenticated',
    });
    global.fetch = vi.fn().mockReturnValue(jsonResponse({ reviews: [OTHER_REVIEW] }));

    renderTab();

    expect(await screen.findByRole('button', { name: /hapus/i })).toBeInTheDocument();
  });

  it('pengguna anonim tidak melihat tombol Hapus', async () => {
    sessionMock.mockReturnValue({ data: null, status: 'unauthenticated' });
    global.fetch = vi.fn().mockReturnValue(jsonResponse({ reviews: [MY_REVIEW] }));

    renderTab();

    expect(await screen.findByText('Animasi luar biasa, soundtracknya juara.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hapus/i })).not.toBeInTheDocument();
  });
});
