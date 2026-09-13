import Link from 'next/link';
import { Home, Search, Flame } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-brand blur-3xl opacity-20" />
        <div className="relative">
          <span className="text-fluid-3xl font-black text-brand text-glow">404</span>
        </div>
      </div>

      <h1 className="heading-section mb-2">Halaman tidak ditemukan</h1>
      <p className="text-fluid-sm text-muted-foreground mb-8 max-w-md text-balance">
        Kayaknya anime yang kamu cari udah tamat atau halaman ini pindah.
        Coba balik ke beranda atau cari anime lain.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-brand-foreground hover:bg-brand/90 transition-colors"
        >
          <Home className="h-4 w-4" /> Beranda
        </Link>
        <Link
          href="/#list"
          className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-5 py-2.5 text-sm font-semibold hover:bg-secondary transition-colors"
        >
          <Search className="h-4 w-4" /> Cari Anime
        </Link>
        <Link
          href="/#collections"
          className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-5 py-2.5 text-sm font-semibold hover:bg-secondary transition-colors"
        >
          <Flame className="h-4 w-4 text-brand" /> Koleksi
        </Link>
      </div>

      <div className="mt-12 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
        AniChin — Anime Subtitle Indonesia
      </div>
    </div>
  );
}
