'use client';

import { useState, useEffect, useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { MailWarning, Send, CheckCircle, X, Loader2 } from 'lucide-react';

/**
 * EmailVerificationBanner
 *
 * Amber banner shown at the top of the page when the logged-in user has not
 * yet verified their email address.
 *
 * Behavior:
 *  - Fetches /api/auth/verification-status on mount (and on focus, to re-check
 *    after returning from email client).
 *  - Hidden when:
 *      • not mounted yet (prevents hydration mismatch)
 *      • not authenticated
 *      • email already verified
 *      • user dismissed banner this session (sessionStorage — re-appears on
 *        new tab / next visit)
 *  - "Kirim ulang" button: POSTs to /api/auth/send-verification, shows a
 *    success toast (and a dev toast with the devUrl in dev so QA can hit the
 *    verification link directly).
 *  - Dismiss button (X): sets sessionStorage flag → banner hidden for this
 *    browser session only.
 *
 * Mount-guard is essential — the banner depends on auth + fetch state, both of
 * which only exist client-side. Rendering nothing during SSR prevents React
 * hydration mismatch warnings.
 */

const SESSION_DISMISS_KEY = 'anichin:email-verification-banner-dismissed';

interface StatusResponse {
  verified?: boolean;
  email?: string;
  error?: string;
}

interface SendResponse {
  sent?: boolean;
  alreadyVerified?: boolean;
  devUrl?: string;
  error?: string;
}

export function EmailVerificationBanner() {
  const mounted = useMounted();
  const { isAuthenticated, isLoading } = useAuth();

  const [verified, setVerified] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Check session dismissal state on mount.
  useEffect(() => {
    if (!mounted) return;
    try {
      const flag = sessionStorage.getItem(SESSION_DISMISS_KEY);
      setDismissed(flag === '1');
    } catch {
      // sessionStorage might be disabled (private mode etc.) — fail open,
      // show banner.
      setDismissed(false);
    }
  }, [mounted]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/verification-status', {
        cache: 'no-store',
      });
      if (res.status === 401) {
        // Not authenticated — banner should be hidden.
        setVerified(null);
        return;
      }
      if (!res.ok) {
        setVerified(null);
        return;
      }
      const data = (await res.json()) as StatusResponse;
      setVerified(Boolean(data.verified));
      setEmail(data.email ?? '');
    } catch {
      // Network error — don't show banner (avoid false alarm).
      setVerified(null);
    }
  }, []);

  // Fetch status when auth resolves.
  useEffect(() => {
    if (!mounted) return;
    if (isLoading) return;
    if (!isAuthenticated) {
      setVerified(null);
      return;
    }
    fetchStatus();
  }, [mounted, isAuthenticated, isLoading, fetchStatus]);

  // Re-check on window focus (user came back from email client).
  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) return;
    const onFocus = () => fetchStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [mounted, isAuthenticated, fetchStatus]);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
      });
      const data = (await res.json()) as SendResponse;

      if (!res.ok) {
        toast.error(data.error || 'Gagal mengirim email verifikasi.');
        return;
      }

      if (data.alreadyVerified) {
        // Race: user verified in another tab. Re-fetch to flip state.
        setVerified(true);
        toast.success('Email kamu sudah terverifikasi.');
        return;
      }

      if (data.sent) {
        toast.success('Email verifikasi telah dikirim. Cek kotak masuk kamu.');
        // Briefly flash a success state on the button so the user gets
        // immediate visual confirmation in-page (in addition to the toast).
        setJustSent(true);
        window.setTimeout(() => setJustSent(false), 2000);

        // In dev (no SMTP), the backend returns devUrl so QA can hit the link
        // directly. Show it as a separate toast — never expose to prod.
        if (data.devUrl) {
          // Use a longer-lived toast with an action so QA can copy / open.
          toast.info('Mode dev: link verifikasi tersedia', {
            duration: 12000,
            description: 'Klik untuk menyalin link verifikasi.',
            action: {
              label: 'Salin',
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(data.devUrl!);
                  toast.success('Link disalin ke clipboard.');
                } catch {
                  // Fallback — open in new tab as last resort.
                  window.open(data.devUrl, '_blank', 'noopener,noreferrer');
                }
              },
            },
          });
        }
      }
    } catch {
      toast.error('Gagal terhubung ke server. Coba lagi.');
    } finally {
      setSending(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      // sessionStorage disabled — banner will reappear on next render cycle.
    }
  };

  // Render nothing during SSR / before mount (prevents hydration mismatch).
  if (!mounted) return null;

  // Not authenticated → hidden.
  if (!isAuthenticated) return null;

  // Verified → show nothing (or a subtle green flash? spec says hidden).
  if (verified === true) return null;

  // Unknown verification state (fetch failed / still loading) → hidden.
  if (verified === null) return null;

  // User dismissed this session → hidden.
  if (dismissed) return null;

  return (
    <div className="sticky top-0 z-[60] w-full border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 backdrop-blur-md">
      <Alert className="rounded-none border-0 bg-transparent py-2.5 text-amber-200 sm:py-2 [&>svg]:text-amber-400">
        <MailWarning className="h-4 w-4" />
        <AlertTitle className="text-amber-100">
          Email belum diverifikasi
        </AlertTitle>
        <AlertDescription className="text-amber-200/90">
          <span className="block sm:inline">
            {email
              ? `Verifikasi email kamu (${email}) biar bisa akses semua fitur.`
              : 'Verifikasi email kamu biar bisa akses semua fitur.'}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:ml-2 sm:inline-flex">
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={sending || justSent}
              className="h-7 gap-1.5 bg-amber-500 px-3 text-xs font-semibold text-black hover:bg-amber-400"
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Mengirim…
                </>
              ) : justSent ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Terkirim
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Kirim ulang
                </>
              )}
            </Button>
            <a
              href="/auth/verify-email"
              className="text-xs font-medium text-amber-200 underline-offset-2 hover:underline"
            >
              Butuh bantuan?
            </a>
          </span>
        </AlertDescription>
      </Alert>

      {/* Dismiss button — only hides for this browser session */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Tutup banner untuk sesi ini"
        className="absolute right-2 top-2 rounded-md p-1 text-amber-300/70 transition-colors hover:bg-amber-500/15 hover:text-amber-100 focus-brand"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
