'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Mail,
  Send,
  CheckCircle,
  Loader2,
  ArrowLeft,
  MailCheck,
  MailWarning,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * /auth/verify-email
 *
 * Manual verification fallback page. Shown when:
 *  - The auto-redirect from the email link failed (rare).
 *  - The user wants to resend the verification email.
 *  - The user came here from the "Need help?" link on the banner.
 *
 * Behavior:
 *  - Loads current verification status on mount.
 *  - If already verified → green success state.
 *  - If not verified → shows "Cek email kamu" prompt + Kirim ulang button.
 *  - On resend: shows success toast, plus a dev toast with the devUrl in dev.
 *  - "Kembali ke beranda" link in footer.
 */

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

type PageState = 'loading' | 'verified' | 'unverified';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [email, setEmail] = useState<string>('');
  const [sending, setSending] = useState(false);

  const fetchStatus = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/auth/verification-status', {
        cache: 'no-store',
      });
      if (res.status === 401) {
        router.replace('/auth/login');
        return;
      }
      if (!res.ok) {
        setState('unverified');
        return;
      }
      const data = (await res.json()) as StatusResponse;
      setEmail(data.email ?? '');
      setState(data.verified ? 'verified' : 'unverified');
    } catch {
      toast.error('Gagal mengambil status verifikasi.');
      setState('unverified');
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleResend = async () => {
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
        setState('verified');
        toast.success('Email kamu sudah terverifikasi.');
        return;
      }

      if (data.sent) {
        toast.success('Email verifikasi telah dikirim. Cek kotak masuk kamu.');
        if (data.devUrl) {
          // Dev mode: backend returned a usable URL — show as an actionable
          // toast so QA / dev can copy or open it.
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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-amber-600 shadow-lg">
            <Mail className="h-7 w-7 text-black" />
          </div>
          <h1 className="text-2xl font-black">Verifikasi Email</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Konfirmasi email kamu buat akses penuh ke AniChin
          </p>
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Memuat…</span>
            </CardContent>
          </Card>
        )}

        {/* VERIFIED */}
        {state === 'verified' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailCheck className="h-5 w-5 text-green-500" />
                Email Sudah Diverifikasi
              </CardTitle>
              <CardDescription>
                {email
                  ? `Email kamu (${email}) sudah aktif.`
                  : 'Email kamu sudah aktif.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-green-500/30 bg-green-500/10 text-green-300 [&>svg]:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Akun terverifikasi</AlertTitle>
                <AlertDescription>
                  Semua fitur AniChin sudah terbuka buat kamu.
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full bg-brand text-brand-foreground hover:bg-brand/90">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" /> Kembali ke beranda
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* UNVERIFIED */}
        {state === 'unverified' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailWarning className="h-5 w-5 text-amber-500" />
                Cek Email Kamu
              </CardTitle>
              <CardDescription>
                {email
                  ? `Kami udah kirim / akan kirim link verifikasi ke ${email}. Klik link di email tersebut untuk mengaktifkan akunmu.`
                  : 'Kirim link verifikasi ke email kamu, lalu klik link di dalam email untuk mengaktifkan akun.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-200 [&>svg]:text-amber-400">
                <MailWarning className="h-4 w-4" />
                <AlertTitle>Belum dapat email?</AlertTitle>
                <AlertDescription>
                  Cek folder spam / junk. Kalau tetap nggak ada, klik
                  “Kirim ulang” di bawah. Link verifikasi berlaku 24 jam.
                </AlertDescription>
              </Alert>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-400">1.</span>
                  Klik tombol di bawah untuk mengirim link verifikasi.
                </p>
                <p className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-400">2.</span>
                  Buka email kamu (atau folder spam) — cari email dari AniChin.
                </p>
                <p className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-400">3.</span>
                  Klik link di dalam email untuk verifikasi otomatis.
                </p>
              </div>

              <Button
                onClick={handleResend}
                disabled={sending}
                className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Mengirim…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Kirim ulang email verifikasi
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-brand"
          >
            <ArrowLeft className="h-3 w-3" /> Beranda
          </Link>
          <button
            onClick={fetchStatus}
            type="button"
            className="inline-flex items-center gap-1 hover:text-brand"
          >
            <RefreshCw className="h-3 w-3" /> Muat ulang status
          </button>
        </div>
      </div>
    </div>
  );
}
