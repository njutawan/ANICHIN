'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  type Locale,
  DEFAULT_LOCALE,
  translate,
  isLocale,
  localeHref,
  LOCALES,
} from '@/lib/i18n';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'anichin-locale';

/**
 * `initialLocale` = locale yang diminta URL (lihat `localeFromPathname`).
 * Dipakai saat render pertama (termasuk SSR), sehingga HTML yang dikirim ke
 * crawler untuk `/en` benar-benar berbahasa Inggris — sebelumnya `/en` selalu
 * di-render dalam bahasa Indonesia.
 */
export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    // URL ber-locale (`/en`) selalu menang agar isi halaman, meta, dan
    // <html lang> konsisten. Preferensi localStorage hanya berlaku di rute
    // netral (`/`) yang tidak menentukan bahasa.
    if (initialLocale !== DEFAULT_LOCALE) {
      setLocaleState(initialLocale);
      return;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) {
      setLocaleState(saved);
    }
  }, [initialLocale]);

  // Kunjungan ke URL ber-locale (`/en`) sekaligus menyimpan preferensi, agar
  // rute netral (mis. `/anime/<slug>`) berikutnya memakai bahasa yang sama.
  useEffect(() => {
    if (initialLocale !== DEFAULT_LOCALE) {
      localStorage.setItem(STORAGE_KEY, initialLocale);
    }
  }, [initialLocale]);

  // <html lang> harus selalu mencerminkan bahasa yang benar-benar dirender
  // (SEO + screen reader). Server sudah mengisinya dari header `x-locale`
  // (src/proxy.ts) untuk initial load; efek ini menjaga saat user toggle.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.documentElement.lang = newLocale;
    }
  }, []);

  const t = useCallback(
    (key: string) => translate(key, locale),
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, locales: LOCALES }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Halaman yang punya padanan URL per bahasa (lihat hreflang di layout).
 * Hanya dua ini: `/` (id) dan `/en` (en).
 */
const LOCALIZED_HOME_PATHS = new Set(['/', '/en']);

/**
 * Logika tombol ganti bahasa (dipakai header desktop & menu mobile).
 *
 * - Di `/` atau `/en`: pindah URL ke locale tujuan, sehingga URL, isi halaman,
 *   `<html lang>`, dan hreflang selalu sepakat (dan bisa dibagikan/di-bookmark
 *   sesuai bahasa).
 * - Di rute netral (mis. `/anime/<slug>`) yang belum punya terjemahan URL,
 *   tukar teks di tempat saja supaya user tidak kehilangan halaman.
 */
export function useLanguageSwitch() {
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const next: Locale = locale === 'id' ? 'en' : 'id';

  const toggle = useCallback(() => {
    const target = localeHref(next);

    // Sudah di URL locale tujuan (mis. `/` → `/` karena preferensi
    // localStorage): cukup perbarui preferensi tanpa navigasi.
    if (!LOCALIZED_HOME_PATHS.has(pathname) || target === pathname) {
      setLocale(next);
      return;
    }

    // Pertahankan query string (mis. filter genre) saat berpindah bahasa.
    const search = typeof window === 'undefined' ? '' : window.location.search;
    router.push(`${target}${search}`);
  }, [next, pathname, router, setLocale]);

  return { locale, next, toggle };
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback for components outside provider (shouldn't happen in practice)
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key: string) => translate(key, DEFAULT_LOCALE),
      locales: LOCALES,
    };
  }
  return ctx;
}
