import { HomeContent } from '@/components/home/home-content';

/**
 * Beranda (Bahasa Indonesia).
 *
 * Semua pengambilan data ada di `HomeContent` (server component) sehingga rute
 * ini dan `/en` berbagi prefetch + cache yang sama.
 */
export default function Home() {
  return <HomeContent />;
}
