'use client';

import { useState, useMemo } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Lock, ArrowRight, Shield, KeyRound, Eye, EyeOff, Loader2, Flame } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { OAuthButtons } from '@/components/site/oauth-buttons';

type LoginStep = 'credentials' | '2fa';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Inline email validation
  const validateEmail = (val: string) => {
    setEmail(val);
    if (!val) { setEmailError(''); return; }
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val)) {
      setEmailError('Format email tidak valid');
    } else {
      setEmailError('');
    }
  };

  const isFormValid = useMemo(() => {
    return email && password && !emailError && password.length >= 6;
  }, [email, password, emailError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid && step === 'credentials') return;
    setLoading(true);

    const res = await signIn('credentials', {
      email,
      password,
      totp: step === '2fa' ? totp : undefined,
      redirect: false,
    });

    setLoading(false);

    if (res?.error && step === 'credentials') {
      try {
        const probe = await fetch('/api/auth/2fa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token: '000000' }),
        });
        const data = await probe.json();
        if (data.requiresTwoFactor) {
          setStep('2fa');
          toast.info('Akun kamu memiliki 2FA aktif. Masukkan kode dari authenticator app.');
          return;
        }
      } catch { /* ignore */ }
    }

    if (res?.error) {
      toast.error(step === '2fa' ? 'Kode 2FA tidak valid' : 'Email atau password salah');
    } else {
      toast.success('Login berhasil');
      router.push('/');
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Flame className="h-7 w-7 text-black" />
          </div>
          <h1 className="text-xl font-black">Masuk ke AniChin</h1>
          <p className="text-sm text-foreground/70 mt-1">
            {step === 'credentials'
              ? 'Login buat simpan bookmark & kasih ulasan'
              : 'Masukkan kode 6-digit dari authenticator app'}
          </p>
        </div>

        {step === 'credentials' ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email field with label */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground/80">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@contoh.com"
                    value={email}
                    onChange={(e) => validateEmail(e.target.value)}
                    className="pl-9"
                    required
                    autoComplete="email"
                    aria-invalid={!!emailError}
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-red-400 mt-1">{emailError}</p>
                )}
              </div>

              {/* Password field with label + show/hide toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-foreground/80">
                    Password
                  </label>
                  <Link href="/auth/forgot-password" className="text-xs text-amber-400 hover:underline">
                    Lupa password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min. 6 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || !isFormValid}
                className="w-full bg-amber-500 text-black hover:bg-amber-400 font-bold h-11"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Memproses…</>
                ) : (
                  <>Masuk <ArrowRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </form>

            {/* OAuth providers — dynamically rendered based on env config */}
            <OAuthButtons callbackUrl="/" label="Masuk dengan" />

            <p className="text-center text-sm text-foreground/70">
              Belum punya akun?{' '}
              <Link href="/auth/register" className="text-amber-400 font-semibold hover:underline">
                Daftar
              </Link>
            </p>
          </>
        ) : (
          <>
            {/* 2FA step */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-center mb-2">
                <div className="h-14 w-14 rounded-full bg-amber-500/15 flex items-center justify-center">
                  <Shield className="h-7 w-7 text-amber-400" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="totp" className="text-sm font-medium text-foreground/80">
                  Kode 2FA
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                  <Input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={totp}
                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                    className="pl-9 text-center tracking-[0.5em] text-lg"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading || totp.length !== 6}
                className="w-full bg-amber-500 text-black hover:bg-amber-400 font-bold h-11"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Memverifikasi…</>
                ) : (
                  <>Verifikasi <ArrowRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </form>
            <button
              onClick={() => { setStep('credentials'); setTotp(''); }}
              className="w-full text-center text-sm text-foreground/70 hover:text-amber-400"
            >
              ← Kembali
            </button>
          </>
        )}

        <div className="text-center">
          <Link href="/" className="text-xs text-foreground/60 hover:text-amber-400">
            ← Balik ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
