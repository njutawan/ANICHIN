// @vitest-environment jsdom
/**
 * Component tests untuk tombol ganti bahasa (P0-7).
 *
 * Kontrak yang diuji:
 * - di `/` dan `/en` tombol **berpindah URL** (locale jadi bagian URL, bukan
 *   hanya state klien) dan mempertahankan query string;
 * - di rute netral yang belum punya padanan terjemahan (`/anime/<slug>`),
 *   teks ditukar di tempat tanpa navigasi (user tidak kehilangan halaman);
 * - kalau URL tujuan sama dengan URL sekarang, cukup simpan preferensi.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
let currentPath = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => currentPath,
}));
vi.mock('@/hooks/use-mounted', () => ({ useMounted: () => true }));

import { I18nProvider } from '@/lib/i18n-context';
import { LanguageToggle } from './language-toggle';

function renderToggle(initialLocale?: 'id' | 'en') {
  return render(
    <I18nProvider initialLocale={initialLocale}>
      <LanguageToggle />
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentPath = '/';
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('<LanguageToggle />', () => {
  it('di `/` navigasi ke `/en` (URL jadi sumber kebenaran bahasa)', async () => {
    renderToggle();
    await userEvent.click(screen.getByRole('button', { name: /switch to english/i }));
    expect(push).toHaveBeenCalledWith('/en');
  });

  it('mempertahankan query string saat berpindah ke `/en`', async () => {
    window.history.pushState({}, '', '/?genre=action&sort=score');
    renderToggle();
    await userEvent.click(screen.getByRole('button', { name: /switch to english/i }));
    expect(push).toHaveBeenCalledWith('/en?genre=action&sort=score');
  });

  it('di `/en` navigasi kembali ke `/`', async () => {
    currentPath = '/en';
    renderToggle('en');
    await userEvent.click(
      screen.getByRole('button', { name: /ganti ke bahasa indonesia/i })
    );
    expect(push).toHaveBeenCalledWith('/');
  });

  it('di rute netral (`/anime/<slug>`) menukar teks di tempat tanpa navigasi', async () => {
    currentPath = '/anime/shadow-blade';
    renderToggle();
    expect(screen.getByText('ID')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /switch to english/i }));

    expect(push).not.toHaveBeenCalled();
    // Teks berubah → locale benar-benar berganti di klien.
    expect(screen.getByText('EN')).toBeDefined();
    expect(
      screen.getByRole('button', { name: /ganti ke bahasa indonesia/i })
    ).toBeDefined();
  });

  it('menyimpan preferensi saat locale diambil dari URL `/en`', async () => {
    currentPath = '/en';
    renderToggle('en');
    // Efek provider menyimpan locale ber-URL ke localStorage agar rute netral
    // berikutnya (mis. `/anime/<slug>`) memakai bahasa yang sama.
    await vi.waitFor(() => {
      expect(window.localStorage.getItem('anichin-locale')).toBe('en');
    });
  });

  it('tidak navigasi saat preferensi localStorage sudah sama dengan URL tujuan', async () => {
    window.localStorage.setItem('anichin-locale', 'en');
    renderToggle();
    // `mounted` true; provider membaca preferensi → tombol menawarkan ID.
    await vi.waitFor(() => {
      expect(screen.getByText('EN')).toBeDefined();
    });
    await userEvent.click(
      screen.getByRole('button', { name: /ganti ke bahasa indonesia/i })
    );
    expect(push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('anichin-locale')).toBe('id');
  });
});
