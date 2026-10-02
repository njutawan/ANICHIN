// @vitest-environment jsdom
/**
 * Test rangkaian provider i18n (P0-7).
 *
 * Yang dijaga di sini: bahasa yang dirender **ditentukan URL** lebih dulu.
 * Sebelumnya `/en` selalu di-render bahasa Indonesia (SSR maupun klien) karena
 * provider hanya membaca localStorage; halaman `/en` jadi bahasa Indonesia
 * dengan `<html lang="en">` — sinyal bahasa yang bertentangan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let currentPath = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useI18n } from '@/lib/i18n-context';
import { Providers } from './providers';

function Probe() {
  const { locale, t } = useI18n();
  return (
    <span data-testid="probe">
      {locale}:{t('nav.home')}
    </span>
  );
}

function renderProviders() {
  return render(
    <Providers>
      <Probe />
    </Providers>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  currentPath = '/';
});

describe('<Providers /> locale dari URL', () => {
  it('`/en` merender bahasa Inggris sejak render pertama (SSR-safe)', () => {
    currentPath = '/en';
    renderProviders();
    expect(screen.getByTestId('probe').textContent).toBe('en:Home');
  });

  it('`/` merender bahasa Indonesia', () => {
    renderProviders();
    expect(screen.getByTestId('probe').textContent).toBe('id:Beranda');
  });

  it('URL ber-locale mengalahkan preferensi localStorage yang berlawanan', () => {
    window.localStorage.setItem('anichin-locale', 'id');
    currentPath = '/en';
    renderProviders();
    expect(screen.getByTestId('probe').textContent).toBe('en:Home');
  });

  it('di rute netral, preferensi localStorage tetap dihormati', () => {
    window.localStorage.setItem('anichin-locale', 'en');
    currentPath = '/anime/shadow-blade';
    renderProviders();
    expect(screen.getByTestId('probe').textContent).toBe('en:Home');
  });
});
