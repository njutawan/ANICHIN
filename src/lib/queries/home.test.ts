/**
 * Unit test untuk kunci query + helper URL homepage (P1-4).
 *
 * Kunci-kunci ini adalah kontrak antara prefetch RSC (`prefetchHomePageData`)
 * dan `useQuery` di komponen: kalau salah satu berubah tanpa yang lain, data
 * hasil prefetch tidak terpakai dan browser kembali memanggil API. Test ini
 * mengunci bentuknya.
 */
import { describe, it, expect } from 'vitest';
import {
  animeListUrl,
  HOME_QUERY_PARAMS,
  HOME_TAB_PARAMS,
  homeQueryKeys,
} from './home';

describe('homeQueryKeys', () => {
  it('memakai bentuk kunci yang stabil (kontrak prefetch ↔ useQuery)', () => {
    expect(homeQueryKeys.breakingNews).toEqual(['breaking-news']);
    expect(homeQueryKeys.latest(3)).toEqual(['latest', 3]);
    expect(homeQueryKeys.today).toEqual(['today-episodes']);
    expect(homeQueryKeys.tabbedRail('airing')).toEqual(['tabbed-rail', 'airing']);
    expect(homeQueryKeys.topRatedRail).toEqual(['anime-rated']);
    expect(homeQueryKeys.upcoming).toEqual(['anime-upcoming']);
    expect(homeQueryKeys.seasons).toEqual(['all-anime-seasons']);
    expect(homeQueryKeys.editorialPicks).toEqual(['editorial-picks']);
    expect(homeQueryKeys.trailers).toEqual(['featured-trailers']);
    expect(homeQueryKeys.collections).toEqual(['collections']);
    expect(homeQueryKeys.genres).toEqual(['genres-list']);
    expect(homeQueryKeys.popular).toEqual(['popular']);
    expect(homeQueryKeys.schedule).toEqual(['schedule']);
    expect(homeQueryKeys.stats).toEqual(['stats']);
    expect(homeQueryKeys.animeList('all', 'all', 'latest', 1)).toEqual([
      'anime-list',
      'all',
      'all',
      'latest',
      1,
    ]);
  });

  it('tidak ada dua dataset berbeda yang berbagi kunci sama', () => {
    const keys = [
      homeQueryKeys.today,
      homeQueryKeys.stats,
      homeQueryKeys.genres,
      homeQueryKeys.popular,
      homeQueryKeys.schedule,
      homeQueryKeys.collections,
      homeQueryKeys.trailers,
      homeQueryKeys.seasons,
      homeQueryKeys.upcoming,
      homeQueryKeys.topRatedRail,
      homeQueryKeys.breakingNews,
      homeQueryKeys.tabbedRail('trending'),
      homeQueryKeys.tabbedRail('airing'),
      homeQueryKeys.tabbedRail('rated'),
    ].map((k) => JSON.stringify(k));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('kunci anime-list berubah saat filter/halaman berubah', () => {
    const a = JSON.stringify(homeQueryKeys.animeList('all', 'all', 'latest', 1));
    const b = JSON.stringify(homeQueryKeys.animeList('action', 'all', 'latest', 1));
    const c = JSON.stringify(homeQueryKeys.animeList('all', 'all', 'latest', 2));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe('animeListUrl', () => {
  it('menyusun URL yang sama dengan yang dipakai komponen sebelumnya', () => {
    expect(animeListUrl(HOME_TAB_PARAMS.trending)).toBe('/api/anime?sort=views&limit=18');
    expect(animeListUrl(HOME_TAB_PARAMS.airing)).toBe('/api/anime?status=Ongoing&sort=latest&limit=18');
    expect(animeListUrl(HOME_TAB_PARAMS.rated)).toBe('/api/anime?sort=score&limit=18');
    expect(animeListUrl(HOME_QUERY_PARAMS.upcoming)).toBe('/api/anime?status=Upcoming&sort=score&limit=12');
    expect(animeListUrl(HOME_QUERY_PARAMS.seasons)).toBe('/api/anime?sort=latest&limit=100');
    expect(animeListUrl({ ...HOME_QUERY_PARAMS.editorialPicks, slugs: 'a,b' })).toBe(
      '/api/anime?slugs=a%2Cb&limit=4'
    );
  });

  it('membuang nilai default ("all"/page 1) seperti yang dilakukan server', () => {
    // Parameter ini tidak mengubah hasil di API (route mengabaikan "all" dan
    // halaman default), jadi URL-nya boleh lebih pendek — penting agar string
    // request tetap sama antar render.
    expect(animeListUrl(HOME_QUERY_PARAMS.browseDefault)).toBe('/api/anime?sort=latest&limit=18');
  });

  it('mengembalikan path polos saat tanpa parameter', () => {
    expect(animeListUrl()).toBe('/api/anime');
  });
});
