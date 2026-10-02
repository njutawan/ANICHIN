/**
 * Unit tests untuk helper i18n yang dipakai plumbing `<html lang>`:
 * `localeFromPathname` (URL → locale) dan `isLocale` (validasi localStorage).
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  localeFromPathname,
  translate,
} from './i18n';

describe('localeFromPathname', () => {
  it('memetakan /en dan sub-route-nya ke en', () => {
    expect(localeFromPathname('/en')).toBe('en');
    expect(localeFromPathname('/en/')).toBe('en');
    expect(localeFromPathname('/en/anime/shadow-blade')).toBe('en');
  });

  it('mengembalikan DEFAULT_LOCALE untuk rute netral', () => {
    expect(localeFromPathname('/')).toBe(DEFAULT_LOCALE);
    expect(localeFromPathname('/anime/shadow-blade')).toBe(DEFAULT_LOCALE);
    expect(localeFromPathname('/auth/login')).toBe(DEFAULT_LOCALE);
  });

  it('tidak salah menebak segmen yang mirip (prefix, bukan segmen)', () => {
    expect(localeFromPathname('/english')).toBe(DEFAULT_LOCALE);
    expect(localeFromPathname('/enx/foo')).toBe(DEFAULT_LOCALE);
  });

  it('aman untuk nilai null/undefined (dipakai saat SSR)', () => {
    expect(localeFromPathname(null)).toBe(DEFAULT_LOCALE);
    expect(localeFromPathname(undefined)).toBe(DEFAULT_LOCALE);
  });

  it('/ja tidak dipetakan — rutenya dihapus & redirect ke `/` (P0-7)', () => {
    // Kontennya dulu bukan bahasa Jepang, hanya duplikat homepage; URL-nya kini
    // 308 redirect permanen (next.config.ts). Test ini menjaga agar tidak ada
    // yang menambahkan pemetaan locale tanpa kamusnya.
    expect(localeFromPathname('/ja')).toBe(DEFAULT_LOCALE);
  });
});

describe('isLocale', () => {
  it('menerima semua kode di LOCALES', () => {
    for (const { code } of LOCALES) {
      expect(isLocale(code)).toBe(true);
    }
  });

  it('menolak nilai yang bukan locale', () => {
    expect(isLocale('ja')).toBe(false);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('translate', () => {
  it('mengembalikan string kamus untuk locale yang diminta', () => {
    expect(translate('nav.home', 'id')).toBe('Beranda');
    expect(translate('nav.home', 'en')).toBe('Home');
  });

  it('fallback ke key itu sendiri saat key tidak dikenal (tidak crash)', () => {
    expect(translate('tidak.ada.key', 'en')).toBe('tidak.ada.key');
  });
});
