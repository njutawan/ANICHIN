// @vitest-environment jsdom
/**
 * P2 — regresi modal komentar episode.
 *
 * Sebelumnya komentar hanya disimpan di localStorage: pengguna lain tidak
 * pernah melihatnya dan tombol hapus hanya menghapus salinan lokal. Test ini
 * mengunci perilaku baru: daftar dibaca dari `/api/comments`, kirim lewat POST,
 * hapus lewat DELETE, dan tombol hapus hanya muncul untuk pemilik/admin.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { sessionMock, toastMock, uiStoreMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  uiStoreMock: { addEpisodeComment: vi.fn() },
}));

vi.mock('next-auth/react', () => ({ useSession: sessionMock }));
vi.mock('next/navigation', () => ({ usePathname: () => '/watch/shadow-blade' }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/store', () => ({
  useUIStore: (selector: (s: typeof uiStoreMock) => unknown) => selector(uiStoreMock),
}));

import { EpisodeComments } from './episode-comments';

const OTHER_USER_COMMENT = {
  id: 'c1',
  userId: 'user-2',
  comment: 'Episode favoritku sejauh ini!',
  likes: 3,
  createdAt: new Date().toISOString(),
  user: { name: 'Budi', avatar: null },
};

const MY_COMMENT = {
  id: 'c2',
  userId: 'user-1',
  comment: 'Animasinya makin rapi ya.',
  likes: 0,
  createdAt: new Date().toISOString(),
  user: { name: 'Tester', avatar: null },
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function renderComments() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EpisodeComments animeSlug="shadow-blade" episodeNumber={3} animeTitle="Shadow Blade" />
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

describe('<EpisodeComments /> — daftar dari server', () => {
  it('menampilkan komentar pengguna lain (bukan dari localStorage)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ comments: [OTHER_USER_COMMENT, MY_COMMENT], hasMore: false, nextCursor: null })
    );

    renderComments();

    expect(await screen.findByText('Episode favoritku sejauh ini!')).toBeInTheDocument();
    expect(screen.getByText('Budi')).toBeInTheDocument();
    expect(screen.getByText('Komentar (2)')).toBeInTheDocument();

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('/api/comments?');
    expect(String(url)).toContain('animeSlug=shadow-blade');
    expect(String(url)).toContain('episodeNumber=3');
  });

  it('menampilkan status kosong & error dengan tombol coba lagi', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    renderComments();
    expect(await screen.findByText(/gagal memuat komentar/i)).toBeInTheDocument();
  });
});

describe('<EpisodeComments /> — kirim komentar', () => {
  it('mengirim komentar ke POST /api/comments dan menampilkan hasil server', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ comments: [], hasMore: false, nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ comment: { id: 'c3' } }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ comments: [{ ...MY_COMMENT, id: 'c3', comment: 'Keren banget!' }], hasMore: false, nextCursor: null })
      );
    global.fetch = fetchMock;

    renderComments();

    const textarea = screen.getByPlaceholderText(/bagikan pendapatmu/i);
    await user.type(textarea, 'Keren banget!');
    await user.click(screen.getByRole('button', { name: /kirim/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/comments', expect.objectContaining({ method: 'POST' }))
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      animeSlug: 'shadow-blade',
      episodeNumber: 3,
      comment: 'Keren banget!',
    });
    expect(toastMock.success).toHaveBeenCalledWith('Komentar terkirim');
    // Jejak lokal untuk pencapaian tetap dicatat.
    expect(uiStoreMock.addEpisodeComment).toHaveBeenCalled();
    expect(await screen.findByText('Keren banget!')).toBeInTheDocument();
  });

  it('menolak kirim saat belum login (tanpa request POST)', async () => {
    sessionMock.mockReturnValue({ data: null, status: 'unauthenticated' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ comments: [], hasMore: false, nextCursor: null }));
    global.fetch = fetchMock;

    renderComments();

    expect(await screen.findByText(/login dulu buat ikut berkomentar/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/bagikan pendapatmu/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /kirim/i })).toBeDisabled();
    // GET daftar tetap jalan; yang penting tidak ada POST.
    const methods = fetchMock.mock.calls.map(([, init]) => init?.method);
    expect(methods).not.toContain('POST');
  });

  it('menampilkan pesan error dari API', async () => {
    const user = userEvent.setup();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ comments: [], hasMore: false, nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Komentar terlalu pendek.' }, 400));

    renderComments();
    await user.type(screen.getByPlaceholderText(/bagikan pendapatmu/i), 'oke banget');
    await user.click(screen.getByRole('button', { name: /kirim/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Komentar terlalu pendek.'));
  });
});

describe('<EpisodeComments /> — hapus komentar', () => {
  it('menampilkan tombol hapus hanya untuk komentar sendiri', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ comments: [OTHER_USER_COMMENT, MY_COMMENT], hasMore: false, nextCursor: null })
    );

    renderComments();
    await screen.findByText('Episode favoritku sejauh ini!');

    expect(screen.getAllByRole('button', { name: /hapus/i })).toHaveLength(1);
  });

  it('admin boleh menghapus komentar siapa pun', async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: 'admin-1', name: 'Admin', role: 'admin' } },
      status: 'authenticated',
    });
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ comments: [OTHER_USER_COMMENT, MY_COMMENT], hasMore: false, nextCursor: null })
    );

    renderComments();
    await screen.findByText('Episode favoritku sejauh ini!');

    expect(screen.getAllByRole('button', { name: /hapus/i })).toHaveLength(2);
  });

  it('memanggil DELETE /api/comments/[id] saat tombol hapus diklik', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(jsonResponse({ ok: true }));
      return Promise.resolve(
        jsonResponse({ comments: [MY_COMMENT], hasMore: false, nextCursor: null })
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderComments();
    await screen.findByText('Animasinya makin rapi ya.');
    await user.click(screen.getByRole('button', { name: /hapus/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/comments/c2', { method: 'DELETE' })
    );
    expect(toastMock.success).toHaveBeenCalledWith('Komentar dihapus');
  });
});
