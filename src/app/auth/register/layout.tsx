import type { Metadata } from 'next';

const SITE_URL = 'https://anichin.id';

export const metadata: Metadata = {
  title: 'Daftar',
  description: 'Daftar gratis di AniChin — cuma butuh email + password. Nonton anime sub Indo HD 1080p, simpan bookmark, dan kasih ulasan.',
  alternates: { canonical: `${SITE_URL}/auth/register` },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'Daftar AniChin — Gratis',
    description: 'Daftar gratis, cuma butuh email + password.',
    url: `${SITE_URL}/auth/register`,
    type: 'website',
  },
};

export default function AuthRegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
