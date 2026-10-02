import type { Metadata } from 'next';

import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: {
    default: 'AniChin — アニメをHD 1080pで無料視聴',
    template: '%s',
  },
  description:
    'アニメをインドネシア語字幕でHD 1080p無料視聴。最新アニメのエピソード、映画、放送中の作品を毎日更新。無料でダウンロードも可能。',
  keywords: [
    'anichin', 'アニメ 視聴', 'アニメ 無料', 'アニメ HD', 'アニメ 字幕',
    'アニメ 配信', '最新アニメ', 'アニメ ダウンロード', 'anime streaming',
  ],
  alternates: {
    canonical: `${SITE_URL}/ja`,
    languages: {
      'id-ID': '/',
      'en-US': '/en',
      'ja-JP': '/ja',
      'x-default': '/',
    },
  },
  openGraph: {
    title: 'AniChin — アニメをHD 1080pで無料視聴',
    description: 'アニメをインドネシア語字幕でHD 1080p無料視聴。毎日更新。',
    siteName: 'AniChin',
    type: 'website',
    url: `${SITE_URL}/ja`,
    locale: 'ja_JP',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'AniChin — アニメ無料視聴' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AniChin — アニメ無料視聴',
    description: 'アニメをHD 1080pで無料視聴。毎日更新。',
    images: ['/twitter-image'],
    creator: '@anichin',
    site: '@anichin',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function JaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
