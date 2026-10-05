// @vitest-environment jsdom
/**
 * Ketahanan beranda (follow-up P1-4) — StructuredData tidak boleh melempar
 * error saat database tidak tersedia; JSON-LD statis (BreadcrumbList + FAQPage)
 * harus tetap terkirim, dan URL anime memakai rute kanonik `/anime/<slug>`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { dbMock, loggerMock, headersMock } = vi.hoisted(() => ({
  dbMock: {
    anime: { findMany: vi.fn() },
    serverReview: { groupBy: vi.fn(), findMany: vi.fn() },
  },
  loggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  headersMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
vi.mock('next/headers', () => ({ headers: headersMock }));

import { StructuredData } from './structured-data';

beforeEach(() => {
  vi.clearAllMocks();
  headersMock.mockResolvedValue(new Map([['x-nonce', 'nonce-uji']]));
});

describe('<StructuredData /> — tanpa database', () => {
  it('tetap merender JSON-LD statis dan tidak melempar', async () => {
    dbMock.anime.findMany.mockRejectedValue(new Error('db down'));

    const html = renderToStaticMarkup(await StructuredData());

    expect(html).toContain('BreadcrumbList');
    expect(html).toContain('FAQPage');
    // Tidak ada data anime → tidak ada ItemList berisi TVSeries.
    expect(html).not.toContain('TVSeries');
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('StructuredData'),
      expect.objectContaining({ error: 'db down' })
    );
  });

  it('memakai URL kanonik /anime/<slug> untuk setiap anime', async () => {
    dbMock.anime.findMany.mockResolvedValue([
      {
        slug: 'shadow-blade',
        title: 'Shadow Blade',
        titleJp: '影の刃',
        titleEn: 'Kage no Yaiba',
        poster: '/anime/poster-shadow-blade.svg',
        score: 9.2,
        views: 100,
        type: 'TV',
        status: 'Ongoing',
        synopsis: 'Sinopsis.',
      },
    ]);
    dbMock.serverReview.groupBy.mockResolvedValue([]);
    dbMock.serverReview.findMany.mockResolvedValue([]);

    const html = renderToStaticMarkup(await StructuredData());

    expect(html).toContain('TVSeries');
    expect(html).toContain('https://anichin.id/anime/shadow-blade');
    expect(html).not.toContain('/?anime=shadow-blade');
  });
});
