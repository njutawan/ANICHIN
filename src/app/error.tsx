'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-destructive blur-3xl opacity-20" />
        <div className="relative h-16 w-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
      </div>

      <h1 className="heading-section mb-2">Ada yang error</h1>
      <p className="text-fluid-sm text-muted-foreground mb-6 max-w-md text-balance">
        Halaman ini ngadat sebentar. Coba reload, atau balik ke beranda.
      </p>

      {error.digest && (
        <p className="mb-4 font-mono text-xs text-muted-foreground/60">
          Error ID: {error.digest}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-brand-foreground hover:bg-brand/90 transition-colors"
        >
          <RotateCcw className="h-4 w-4" /> Coba lagi
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-5 py-2.5 text-sm font-semibold hover:bg-secondary transition-colors"
        >
          <Home className="h-4 w-4" /> Beranda
        </Link>
      </div>
    </div>
  );
}
