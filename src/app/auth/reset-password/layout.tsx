import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password — AniChin',
  description: 'Reset password akun AniChin kamu',
  robots: { index: false, follow: false }, // Don't index auth pages
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
