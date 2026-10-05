// @vitest-environment jsdom
/**
 * Ketahanan beranda (follow-up P1-4) — HeroSlider tidak boleh melempar error
 * saat database tidak tersedia.
 *
 * Sebelumnya kegagalan query membuat React error boundary mengambil alih
 * seluruh beranda; HTML yang dikirim ke crawler hanya berisi skip-link.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, loggerMock } = vi.hoisted(() => ({
  dbMock: { anime: { findMany: vi.fn() } },
  loggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

import { HeroSlider } from './hero-slider';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<HeroSlider /> — tanpa database', () => {
  it('mengembalikan null (tidak melempar) dan mencatat error', async () => {
    dbMock.anime.findMany.mockRejectedValue(new Error('Can\'t reach database server'));

    await expect(HeroSlider()).resolves.toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('HeroSlider'),
      expect.objectContaining({ error: "Can't reach database server" })
    );
  });

  it('tetap null kalau hasil query kosong (tidak error)', async () => {
    dbMock.anime.findMany.mockResolvedValue([]);

    await expect(HeroSlider()).resolves.toBeNull();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});
