'use client';

import { useState } from 'react';
import Image from 'next/image';
import { isRemoteImageSrc, needsUnoptimized } from '@/lib/image-hosts';

interface AnimeImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  width?: number;
  height?: number;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
}

function generateFallbackSvg(title: string): string {
  const colors = ['#7f1d1d', '#1e3a8a', '#6b21a8', '#155e75', '#9d174d', '#854d0e', '#166534', '#1e1b4b'];
  const hash = title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const color1 = colors[hash % colors.length];
  const color2 = '#0d0d12';
  const initial = title.charAt(0).toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color1}"/>
        <stop offset="100%" stop-color="${color2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="600" fill="url(#bg)"/>
    <text x="200" y="300" font-family="sans-serif" font-size="120" font-weight="900" fill="white" opacity="0.3" text-anchor="middle" dominant-baseline="middle">${initial}</text>
    <text x="200" y="400" font-family="sans-serif" font-size="14" font-weight="600" fill="white" opacity="0.5" text-anchor="middle">${title.slice(0, 20)}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Next.js image optimizer MENOLAK SVG ("image type is not allowed" → HTTP 400)
 * kecuali `images.dangerouslyAllowSVG` diaktifkan. Poster/banner katalog ini
 * berupa SVG, jadi tanpa penanganan khusus semua poster gagal dimuat dan hanya
 * menampilkan fallback gradient.
 *
 * Solusi: SVG (dan data-URI) disajikan langsung dengan `unoptimized` — tidak
 * lewat optimizer, sehingga tidak perlu mengaktifkan dangerouslyAllowSVG
 * (yang membuka risiko XSS lewat SVG dari host eksternal).
 *
 * P1-5: gambar remote dari host di luar whitelist (`images.remotePatterns`)
 * juga disajikan langsung. Kalau tetap dilewatkan optimizer, Next menjawab
 * HTTP 400 dan poster admin yang memakai CDN lain akan hilang; dengan begini
 * gambar tetap tampil, tetapi server kita tidak pernah mengunduhnya.
 */
function isUnoptimizable(src: string): boolean {
  if (src.startsWith('data:') || /\.svg(\?|#|$)/i.test(src)) return true;
  return isRemoteImageSrc(src) && needsUnoptimized(src);
}

export function AnimeImage({ src, alt, className, width, height, fill, sizes, priority }: AnimeImageProps) {
  const [error, setError] = useState(false);
  const [fallbackSrc] = useState(() => generateFallbackSvg(alt));
  const unoptimized = isUnoptimizable(src);

  if (error) {
    // Use regular img for fallback (data URI doesn't need optimization)
    return (
      <img
        src={fallbackSrc}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes || '(max-width: 768px) 50vw, (max-width: 1200px) 20vw, 16vw'}
        className={className}
        priority={priority}
        unoptimized={unoptimized}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width || 400}
      height={height || 600}
      className={className}
      priority={priority}
      unoptimized={unoptimized}
      onError={() => setError(true)}
    />
  );
}
