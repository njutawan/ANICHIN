import type { Metadata } from 'next';

/**
 * Admin area harus selalu noindex.
 *
 * Halaman /admin dilindungi proxy (JWT role check) + requireAdmin() di setiap
 * route API, tapi tanpa metadata ini URL-nya masih bisa muncul di hasil
 * pencarian. `robots.ts` juga sudah men-disallow /admin — dua-duanya dipakai
 * sebagai defense in depth.
 */
export const metadata: Metadata = {
  title: 'Panel Admin',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
