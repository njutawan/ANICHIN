'use client';

import { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Type for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA Install Button — shows "Pasang Aplikasi" button when browser
 * supports installation (Chrome, Edge, Samsung Internet, etc.).
 *
 * On iOS Safari, shows instructions to "Add to Home Screen" (iOS doesn't
 * support beforeinstallprompt event, so we detect iOS and show a tooltip).
 *
 * On desktop (Chrome/Edge), shows the install button in the header.
 *
 * Pass `className` to control responsive visibility (e.g. `hidden lg:inline-flex`).
 */
export function PwaInstallButton({ className }: { className?: string } = {}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    if (isStandalone || isIOSStandalone) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS (Safari doesn't support beforeinstallprompt)
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Listen for beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault(); // Prevent auto-prompt
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for appinstalled event
    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      toast.success('AniChin berhasil dipasang! 🎉');
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  // Don't show button if already installed
  if (isInstalled) return null;

  // iOS: show a different button that opens instructions
  if (isIOS && !deferredPrompt) {
    return (
      <>
        <button
          onClick={() => setShowIOSHint(true)}
          className={cn(
            'flex items-center gap-1.5 h-11 px-3 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors text-sm font-medium',
            className
          )}
          title="Pasang AniChin di iPhone"
        >
          <Smartphone className="h-4 w-4" />
          <span className="hidden sm:inline">Pasang Aplikasi</span>
        </button>

        {/* iOS Install Instructions Modal */}
        {showIOSHint && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowIOSHint(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-amber-400" />
                  Pasang AniChin
                </h3>
                <button
                  onClick={() => setShowIOSHint(false)}
                  className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-foreground/70 mb-4">
                Untuk memasang AniChin di iPhone/iPad:
              </p>
              <ol className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="shrink-0 h-6 w-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Tap tombol <strong>Share</strong> di Safari (ikon kotak dengan panah ke atas, di bawah)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 h-6 w-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Pilih <strong>"Tambahkan ke Layar Utama"</strong> (Add to Home Screen)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 h-6 w-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">3</span>
                  <span>Tap <strong>"Tambah"</strong> — AniChin akan muncul di home screen seperti aplikasi</span>
                </li>
              </ol>
              <div className="mt-5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
                💡 Setelah dipasang, AniChin bisa dibuka tanpa browser, full screen, dan bekerja offline.
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Android/Desktop (Chrome, Edge, Samsung): show install button
  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      toast.success('AniChin sedang dipasang… 📱');
    }

    setDeferredPrompt(null);
  };

  return (
    <button
      onClick={handleInstall}
      className={cn(
        'flex items-center gap-1.5 h-11 px-3 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors text-sm font-medium animate-fade-up',
        className
      )}
      title="Pasang AniChin sebagai aplikasi"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Pasang Aplikasi</span>
    </button>
  );
}

