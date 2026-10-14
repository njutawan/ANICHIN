import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/session';

/**
 * Admin area harus selalu noindex.
 *
 * Halaman /admin dijaga tiga lapis:
 *   1. `src/proxy.ts` (Edge) — menolak non-admin berdasarkan klaim JWT, murah
 *      tapi TIDAK memeriksa DB;
 *   2. layout ini (Node runtime) — `isAdmin()` menempuh jalur session NextAuth
 *      yang menjalankan `jwt` callback, sehingga `sessionVersion` di DB ikut
 *      diperiksa: admin yang baru diturunkan atau akun yang dihapus langsung
 *      ditolak (pencabutan sesi, audit F-06);
 *   3. setiap route `/api/admin/*` memanggil `requireAdmin()` — sumber data
 *      sebenarnya, jadi tidak ada data admin yang bisa diambil tanpa hak admin.
 *
 * Tanpa metadata ini URL /admin masih bisa muncul di hasil pencarian
 * (`robots.ts` juga men-disallow /admin — dua-duanya defense in depth).
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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) {
    redirect('/auth/login?callbackUrl=/admin&error=AccessDenied');
  }
  return children;
}
