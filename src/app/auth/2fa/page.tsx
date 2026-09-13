'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  ShieldCheck,
  QrCode,
  Copy,
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

type PageState =
  | 'loading'
  | 'disabled'
  | 'enabled'
  | 'setup' // showing QR + 6-digit input
  | 'backup-codes' // success — showing backup codes
  | 'disable-form'; // password re-entry to disable

interface SetupData {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  expiresInSec: number;
}

export default function TwoFactorPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [copiedSingleCode, setCopiedSingleCode] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // ----- Initial status fetch -----
  const fetchStatus = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/auth/2fa/status', { cache: 'no-store' });
      if (res.status === 401) {
        // Not authenticated — bounce to login
        router.replace('/auth/login');
        return;
      }
      if (!res.ok) throw new Error('status fetch failed');
      const data = (await res.json()) as { enabled?: boolean };
      setState(data.enabled ? 'enabled' : 'disabled');
    } catch {
      toast.error('Gagal mengambil status 2FA');
      setState('disabled');
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ----- Setup (start the enable flow) -----
  const handleSetup = async () => {
    setSubmitting(true);
    setToken('');
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal menyiapkan 2FA');
        return;
      }
      setSetupData({
        secret: data.secret,
        otpauthUrl: data.otpauthUrl,
        qrCodeDataUrl: data.qrCodeDataUrl,
        expiresInSec: data.expiresInSec ?? 300,
      });
      setState('setup');
      toast.success('Scan QR dengan aplikasi authenticator kamu');
    } catch {
      toast.error('Gagal terhubung ke server');
    } finally {
      setSubmitting(false);
    }
  };

  // ----- Enable (verify 6-digit token, persist secret) -----
  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = token.trim();
    if (!/^\d{6}$/.test(clean)) {
      toast.error('Kode harus 6 digit angka');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal mengaktifkan 2FA');
        return;
      }
      setBackupCodes(data.backupCodes ?? []);
      setSetupData(null);
      setToken('');
      setState('backup-codes');
      toast.success('2FA berhasil diaktifkan!');
    } catch {
      toast.error('Gagal terhubung ke server');
    } finally {
      setSubmitting(false);
    }
  };

  // ----- Disable (password re-entry) -----
  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error('Password wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal menonaktifkan 2FA');
        return;
      }
      setPassword('');
      setState('disabled');
      toast.success('2FA dinonaktifkan');
    } catch {
      toast.error('Gagal terhubung ke server');
    } finally {
      setSubmitting(false);
    }
  };

  // ----- Copy helpers -----
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopySecret = async () => {
    if (!setupData) return;
    if (await copyToClipboard(setupData.secret)) {
      setCopiedSecret(true);
      toast.success('Secret disalin ke clipboard');
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      toast.error('Gagal menyalin');
    }
  };

  const handleCopyAllCodes = async () => {
    if (backupCodes.length === 0) return;
    if (await copyToClipboard(backupCodes.join('\n'))) {
      setCopiedCodes(true);
      toast.success('Semua kode cadangan disalin');
      setTimeout(() => setCopiedCodes(false), 2000);
    } else {
      toast.error('Gagal menyalin');
    }
  };

  const handleCopySingleCode = async (code: string) => {
    if (await copyToClipboard(code)) {
      setCopiedSingleCode(code);
      toast.success('Kode disalin');
      setTimeout(() => setCopiedSingleCode(null), 1500);
    }
  };

  const handleCancelSetup = () => {
    setSetupData(null);
    setToken('');
    setState('disabled');
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-amber-600 shadow-lg">
            <Shield className="h-7 w-7 text-black" />
          </div>
          <h1 className="text-2xl font-black">Two-Factor Authentication</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lindungi akunmu dengan kode 6-digit dari aplikasi authenticator
          </p>
        </div>

        {/* Loading state */}
        {state === 'loading' && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Memuat…</span>
            </CardContent>
          </Card>
        )}

        {/* DISABLED state — entry point to enable 2FA */}
        {state === 'disabled' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  Status 2FA
                </CardTitle>
                <Badge variant="secondary">Nonaktif</Badge>
              </div>
              <CardDescription>
                Akunmu belum dilindungi 2FA. Aktifkan untuk menambah lapisan
                keamanan saat login.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  Setiap login butuh kode 6-digit selain password
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  Kode dihasilkan oleh aplikasi seperti Google Authenticator,
                  Authy, atau 1Password
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  Dapatkan 8 kode cadangan untuk darurat
                </li>
              </ul>
              <Button
                onClick={handleSetup}
                disabled={submitting}
                className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Menyiapkan…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" /> Aktifkan 2FA
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* SETUP state — QR code + secret + 6-digit input */}
        {state === 'setup' && setupData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-brand" />
                Scan QR Code
              </CardTitle>
              <CardDescription>
                Buka aplikasi authenticator, pilih “Add account”, lalu scan kode
                di bawah. Punya waktu ±5 menit sebelum sesi kedaluwarsa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* QR */}
              <div className="flex justify-center rounded-lg border border-border/60 bg-white p-3">
                <img
                  src={setupData.qrCodeDataUrl}
                  alt="QR code for 2FA"
                  width={220}
                  height={220}
                  className="h-[220px] w-[220px]"
                />
              </div>

              {/* Manual secret (for users who can't scan) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Manual key
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopySecret}
                    className="h-7 px-2 text-xs"
                  >
                    {copiedSecret ? (
                      <>
                        <Check className="h-3 w-3" /> Disalin
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Salin
                      </>
                    )}
                  </Button>
                </div>
                <code className="block w-full break-all rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-xs text-foreground">
                  {setupData.secret}
                </code>
              </div>

              {/* 6-digit token input */}
              <form onSubmit={handleEnable} className="space-y-3">
                <label
                  htmlFor="totp-token"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Masukkan kode 6-digit dari authenticator
                </label>
                <Input
                  id="totp-token"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={token}
                  onChange={(e) =>
                    setToken(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="text-center text-2xl font-mono tracking-[0.5em]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelSetup}
                    className="flex-1"
                    disabled={submitting}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || token.length !== 6}
                    className="flex-1 bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Verifikasi…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" /> Aktifkan
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* BACKUP CODES state — one-time display */}
        {state === 'backup-codes' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-500" />
                Kode Cadangan
              </CardTitle>
              <CardDescription>
                Simpan kode-kode ini di tempat aman. Tiap kode hanya bisa
                dipakai sekali kalau kamu kehilangan akses ke authenticator.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Penting!</AlertTitle>
                <AlertDescription>
                  Kode hanya ditampilkan sekali ini. Kalau hilang, kamu tidak
                  bisa login kalau authenticator hilang. Salin atau catat
                  sekarang.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleCopySingleCode(code)}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/40 px-3 py-2 font-mono text-sm transition-colors hover:bg-secondary/80"
                  >
                    <span>{code}</span>
                    {copiedSingleCode === code ? (
                      <Check className="h-3 w-3 text-brand" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={handleCopyAllCodes}
                className="w-full"
              >
                {copiedCodes ? (
                  <>
                    <Check className="h-4 w-4" /> Semua kode disalin
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Salin semua kode
                  </>
                )}
              </Button>

              <Button
                onClick={() => setState('enabled')}
                className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Check className="h-4 w-4" /> Sudah simpan, selesai
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ENABLED state — option to disable */}
        {state === 'enabled' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                  Status 2FA
                </CardTitle>
                <Badge className="bg-green-600/20 text-green-500 border-green-500/30">
                  Aktif
                </Badge>
              </div>
              <CardDescription>
                Akunmu dilindungi 2FA. Login butuh kode 6-digit dari
                authenticator selain password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Akun terlindungi</AlertTitle>
                <AlertDescription>
                  Pastikan aplikasi authenticator dan kode cadangan tersimpan
                  aman. Jangan nonaktifkan 2FA kecuali benar-benar perlu.
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                onClick={() => setState('disable-form')}
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <Shield className="h-4 w-4" /> Nonaktifkan 2FA
              </Button>
            </CardContent>
          </Card>
        )}

        {/* DISABLE FORM state — password re-entry */}
        {state === 'disable-form' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Konfirmasi Password
              </CardTitle>
              <CardDescription>
                Demi keamanan, masukkan password kamu lagi untuk menonaktifkan
                2FA.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Peringatan</AlertTitle>
                <AlertDescription>
                  Setelah dinonaktifkan, akunmu hanya dilindungi password.
                  Pastikan tidak ada orang lain yang menggunakan perangkat ini.
                </AlertDescription>
              </Alert>
              <form onSubmit={handleDisable} className="space-y-3">
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                    autoComplete="current-password"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPassword('');
                      setState('enabled');
                    }}
                    className="flex-1"
                    disabled={submitting}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    className="flex-1"
                    disabled={submitting || !password}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Memproses…
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" /> Nonaktifkan
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-brand"
          >
            <ArrowLeft className="h-3 w-3" /> Balik ke beranda
          </Link>
          <button
            onClick={fetchStatus}
            className="inline-flex items-center gap-1 hover:text-brand"
            type="button"
          >
            <RefreshCw className="h-3 w-3" /> Muat ulang status
          </button>
        </div>
      </div>
    </div>
  );
}
