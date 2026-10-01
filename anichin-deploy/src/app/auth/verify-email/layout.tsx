import type { Metadata } from 'next';

const SITE_URL = 'https://anichin.id';

export const metadata: Metadata = {
  title: 'Verifikasi Email · AniChin',
  description: 'Verifikasi email kamu buat mengaktifkan akun AniChin.',
  alternates: { canonical: `${SITE_URL}/auth/verify-email` },
  robots: { index: false, follow: true },
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
