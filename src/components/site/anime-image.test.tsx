// @vitest-environment jsdom
/**
 * Tests for <AnimeImage />.
 *
 * Bug yang dicegah: Next.js image optimizer menolak SVG (HTTP 400
 * "image type is not allowed"), sedangkan semua poster/banner katalog adalah
 * SVG. Komponen harus menyajikan SVG langsung (tanpa `/_next/image`) dan tetap
 * mengoptimasi raster (.png/.jpg/.webp).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimeImage } from './anime-image';

describe('<AnimeImage />', () => {
  it('menyajikan SVG langsung tanpa image optimizer', () => {
    render(<AnimeImage src="/anime/poster-shadow-blade.svg" alt="Shadow Blade" width={400} height={600} />);
    const img = screen.getByAltText('Shadow Blade');
    // URL boleh absolut (Next Image menormalkannya) — yang penting BUKAN
    // lewat endpoint optimizer `/_next/image`.
    expect(img.getAttribute('src')).toContain('/anime/poster-shadow-blade.svg');
    expect(img.getAttribute('src')).not.toContain('_next/image');
  });

  it('menyajikan data-URI langsung (fallback)', () => {
    const dataUri = 'data:image/svg+xml;base64,PHN2Zy8+';
    render(<AnimeImage src={dataUri} alt="Fallback" width={40} height={60} />);
    expect(screen.getByAltText('Fallback').getAttribute('src')).toContain(dataUri);
  });

  it('mengoptimasi gambar raster lewat Next Image', () => {
    render(<AnimeImage src="/icon-192.png" alt="Raster" width={192} height={192} />);
    const img = screen.getByAltText('Raster');
    // Next Image merender srcset/src ke endpoint optimizer untuk raster.
    expect(img.getAttribute('src')).toContain('_next/image');
  });

  it('mendukung mode fill', () => {
    render(<AnimeImage src="/anime/banner-neon-samurai.svg" alt="Banner" fill sizes="100vw" />);
    const img = screen.getByAltText('Banner');
    expect(img.getAttribute('src')).toContain('/anime/banner-neon-samurai.svg');
    expect(img.getAttribute('src')).not.toContain('_next/image');
  });
});
