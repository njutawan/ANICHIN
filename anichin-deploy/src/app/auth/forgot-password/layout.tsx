import type { Metadata } from 'next';

const SITE_URL = 'https://anichin.id';

export const metadata: Metadata = {
  title: 'Lupa Password',
  description: 'Reset password akun AniChin kamu. Masukkan email, kami kirim link reset password.',
  alternates: { canonical: `${SITE_URL}/auth/forgot-password` },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'Lupa Password',
    description: 'Reset password akun AniChin kamu.',
    url: `${SITE_URL}/auth/forgot-password`,
    type: 'website',
  },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
