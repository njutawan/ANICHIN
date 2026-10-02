import type { Metadata } from 'next';

import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Keamanan Akun (2FA) · AniChin',
  description: 'Aktifkan two-factor authentication (2FA) buat mengamankan akun AniChin kamu dengan kode TOTP.',
  alternates: { canonical: `${SITE_URL}/auth/2fa` },
  robots: { index: false, follow: true },
};

export default function Auth2faLayout({ children }: { children: React.ReactNode }) {
  return children;
}
