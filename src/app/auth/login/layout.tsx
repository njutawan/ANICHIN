import type { Metadata } from 'next';

import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Login ke AniChin buat simpan bookmark, lanjut menonton, dan kasih ulasan anime favoritmu.',
  alternates: { canonical: `${SITE_URL}/auth/login` },
  robots: { index: false, follow: true }, // Auth pages shouldn't be indexed
  openGraph: {
    title: 'Masuk',
    description: 'Login buat simpan bookmark & kasih ulasan.',
    url: `${SITE_URL}/auth/login`,
    type: 'website',
  },
};

export default function AuthLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
