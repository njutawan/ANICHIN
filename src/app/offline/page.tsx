'use client';

import Link from 'next/link';
import { Flame, RefreshCw, Home, WifiOff } from 'lucide-react';

// Note: metadata can't be exported from Client Components.
// The root layout's default metadata applies (offline page isn't indexed anyway).

export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md space-y-6 py-16">
        {/* Logo */}
        <div className="mx-auto mb-2 h-14 w-14 rounded-xl bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center font-black text-black text-2xl shadow-lg shadow-brand/30">
          A
        </div>

        {/* Offline icon */}
        <div className="mx-auto h-20 w-20 rounded-full bg-secondary/60 flex items-center justify-center">
          <WifiOff className="h-10 w-10 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight">
            Kamu Sedang Offline
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sepertinya koneksi internetmu terputus. Beberapa konten yang sudah
            kamu kunjungi sebelumnya masih bisa diakses dari cache. Coba
            periksa koneksi lalu muat ulang halaman.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-brand text-brand-foreground hover:bg-brand/90 font-semibold text-sm transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Coba Lagi
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full border border-border bg-secondary/70 hover:bg-secondary text-foreground font-medium text-sm transition-colors"
          >
            <Home className="h-4 w-4" />
            Ke Beranda
          </Link>
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Flame className="h-3 w-3 text-brand" />
            AniChin — Anime Sub Indo
          </p>
        </div>
      </div>
    </main>
  );
}
