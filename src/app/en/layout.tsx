import type { Metadata } from 'next';

import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: {
    default: 'AniChin — Watch Anime with Subtitles in HD 1080p Free',
    template: '%s',
  },
  description:
    'Watch and download anime with English subtitles in HD 1080p for free. Stream the latest anime episodes, movies, and ongoing series. Updated daily.',
  keywords: [
    'anichin', 'anime online', 'watch anime', 'anime streaming', 'anime free',
    'anime HD 1080p', 'anime with subtitles', 'anime episodes', 'latest anime',
    'ongoing anime', 'anime movies', 'anime download',
  ],
  alternates: {
    canonical: `${SITE_URL}/en`,
    languages: {
      'id-ID': '/',
      'en-US': '/en',
      'ja-JP': '/ja',
      'x-default': '/',
    },
  },
  openGraph: {
    title: 'AniChin — Watch Anime with Subtitles in HD 1080p Free',
    description: 'Stream and download anime with subtitles in HD 1080p. New episodes daily, completely free.',
    siteName: 'AniChin',
    type: 'website',
    url: `${SITE_URL}/en`,
    locale: 'en_US',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'AniChin — Watch Anime Online' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AniChin — Watch Anime Online Free',
    description: 'Stream anime with subtitles in HD 1080p for free. Updated daily.',
    images: ['/twitter-image'],
    creator: '@anichin',
    site: '@anichin',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
};

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
