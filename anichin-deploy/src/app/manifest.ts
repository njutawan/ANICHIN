import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AniChin — Nonton Anime Subtitle Indonesia',
    short_name: 'AniChin',
    description: 'Streaming dan download anime sub Indo terlengkap. Update episode terbaru setiap hari, kualitas HD 1080p gratis.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any', // Allow both portrait and landscape
    background_color: '#0d0d12',
    theme_color: '#fbbf24',
    categories: ['entertainment', 'video', 'music'],
    lang: 'id-ID',
    dir: 'ltr',
    // Icons for all platforms (Android, iOS, Desktop)
    icons: [
      // SVG icon (scalable, used by desktop)
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      // Standard Android icons
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // Maskable icons (Android adaptive icon)
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // App shortcuts (long-press on Android, right-click on Desktop)
    shortcuts: [
      {
        name: 'Anime List',
        short_name: 'Anime',
        url: '/?source=pwa#list',
        description: 'Browse semua anime',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Jadwal Rilis',
        short_name: 'Jadwal',
        url: '/?source=pwa#schedule',
        description: 'Jadwal rilis episode harian',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Koleksi',
        url: '/?source=pwa#collections',
        description: 'Koleksi anime pilihan',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
    // File types this PWA can handle
    file_handlers: [],
    // Protocol handlers (deep linking)
    protocol_handlers: [],
    // Screenshots for install prompt (Android Chrome)
    screenshots: [
      {
        src: '/og-image.png',
        sizes: '1200x630',
        type: 'image/png',
        form_factor: 'wide',
        label: 'AniChin Homepage',
      },
    ],
    // Related apps (none — standalone PWA)
    related_applications: [],
    // Prefer this PWA over native apps
    prefer_related_applications: false,
  };
}
