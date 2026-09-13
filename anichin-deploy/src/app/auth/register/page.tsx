'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, Loader2, Flame, Check } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { OAuthButtons } from '@/components/site/oauth-buttons';

// Password strength meter
function getPasswordStrength(pwd: string): { score: number; label: string; color: string; bars: number } {
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  const labels = ['Terlalu lemah', 'Lemah', 'Cukup', 'Baik', 'Kuat'];
  const colors = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-green-500'];
  return { score, label: labels[Math.min(score, 4)] || '', color: colors[Math.min(score, 4)], bars: Math.min(score, 4) };
}

// Password requirements checklist
function PasswordRequirements({ pwd }: { pwd: string }) {
  const checks = [
    { label: 'Min. 6 karakter', pass: pwd.length >= 6 },
    { label: 'Ada huruf', pass: /[a-zA-Z]/.test(pwd) },
    { label: 'Ada angka', pass: /[0-9]/.test(pwd) },
    { label: 'Min. 10 karakter (opsional)', pass: pwd.length >= 10, optional: true },
  ];
  return (
    <div className="space-y-1 mt-2">
      {checks.map((c) => (
        <div key={c.label} className="flex items-center gap-1.5 text-xs">
          {c.pass ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : (
            <div className={`h-3 w-3 rounded-full border ${c.optional ? 'border-foreground/20' : 'border-foreground/40'}`} />
          )}
          <span className={c.pass ? 'text-green-400' : c.optional ? 'text-foreground/40' : 'text-foreground/60'}>
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [nameError, setNameError] = useState('');

  // Inline validation
  const validateEmail = (val: string) => {
    setEmail(val);
    if (!val) { setEmailError(''); return; }
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val)) {
      setEmailError('Format email tidak valid');
    } else {
      setEmailError('');
    }
  };

  const validateName = (val: string) => {
    setName(val);
    if (!val) { setNameError(''); return; }
    if (val.length < 2) { setNameError('Nama minimal 2 karakter'); }
    else if (val.length > 30) { setNameError('Nama maksimal 30 karakter'); }
    else { setNameError(''); }
  };

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = password === confirmPassword;
  const isFormValid = useMemo(() => {
    return name.length >= 2 && name.length <= 30
      && email && !emailError
      && password.length >= 6 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password)
      && passwordsMatch;
  }, [name, email, emailError, password, passwordsMatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Gagal daftar');
        setLoading(false);
        return;
      }

      await signIn('credentials', { email, password, redirect: false });
      toast.success('Daftar berhasil! Selamat datang.');
      router.push('/');
    } catch {
      toast.error('Gagal daftar. Coba lagi.');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Flame className="h-7 w-7 text-black" />
          </div>
          <h1 className="text-xl font-black">Daftar AniChin</h1>
          <p className="text-sm text-foreground/70 mt-1">Gratis, cuma butuh email + password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name field with label */}
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-foreground/80">
              Nama
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                id="name"
                type="text"
                placeholder="Nama kamu"
                value={name}
                onChange={(e) => validateName(e.target.value)}
                className="pl-9"
                required
                maxLength={30}
                autoComplete="name"
                aria-invalid={!!nameError}
              />
            </div>
            {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
          </div>

          {/* Email field with label */}
          <div className="space-y-1.5">
            <label htmlFor="reg-email" className="text-sm font-medium text-foreground/80">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                id="reg-email"
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
            {emailError && <p className="text-xs text-red-400 mt-1">{emailError}</p>}
          </div>

          {/* Password field with label + show/hide + strength meter */}
          <div className="space-y-1.5">
            <label htmlFor="reg-password" className="text-sm font-medium text-foreground/80">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-10"
                required
                autoComplete="new-password"
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
            {/* Password strength meter */}
            {password && (
              <div className="mt-2">
                <div className="flex gap-1 h-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-colors ${
                        i <= strength.bars ? strength.color : 'bg-foreground/10'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-foreground/60 mt-1">{strength.label}</p>
                <PasswordRequirements pwd={password} />
              </div>
            )}
          </div>

          {/* Confirm password field */}
          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className="text-sm font-medium text-foreground/80">
              Konfirmasi Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Ulangi password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-9 pr-10"
                required
                autoComplete="new-password"
                aria-invalid={!!confirmPassword && !passwordsMatch}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                aria-label={showConfirm ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-400 mt-1">Password tidak cocok</p>
            )}
            {confirmPassword && passwordsMatch && (
              <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <Check className="h-3 w-3" /> Password cocok
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading || !isFormValid}
            className="w-full bg-amber-500 text-black hover:bg-amber-400 font-bold h-11"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Mendaftarkan…</>
            ) : (
              <>Daftar <ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </form>

        {/* OAuth providers — dynamically rendered based on env config */}
        <OAuthButtons callbackUrl="/" label="Daftar dengan" />

        <p className="text-center text-sm text-foreground/70">
          Udah punya akun?{' '}
          <Link href="/auth/login" className="text-amber-400 font-semibold hover:underline">
            Masuk
          </Link>
        </p>

        <div className="text-center">
          <Link href="/" className="text-xs text-foreground/60 hover:text-amber-400">
            ← Balik ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
