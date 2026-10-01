'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Eye, EyeOff, Loader2, Flame, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

function getPasswordStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  const labels = ['Terlalu lemah', 'Lemah', 'Cukup', 'Baik', 'Kuat'];
  const colors = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-green-500'];
  return { score, label: labels[Math.min(score, 4)] || '', color: colors[Math.min(score, 4)] };
}

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const isFormValid = useMemo(() => {
    return (
      token.length === 64 &&
      password.length >= 6 &&
      /[a-zA-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      password === confirmPassword
    );
  }, [token, password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success('Password berhasil direset! Silakan login.');
        router.push('/auth/login');
      } else {
        toast.error(data.error || 'Token tidak valid atau sudah kadaluarsa.');
      }
    } catch {
      toast.error('Gagal mereset password. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  // No token in URL — show error state
  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Flame className="h-7 w-7 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-black">Token Tidak Ditemukan</h1>
            <p className="text-sm text-foreground/70 mt-1">
              Link reset password tidak valid. Pastikan kamu klik link dari email.
            </p>
          </div>
          <Link href="/auth/forgot-password">
            <Button className="w-full bg-amber-500 text-black hover:bg-amber-400 font-bold h-11">
              Minta Link Reset Baru
            </Button>
          </Link>
          <Link href="/" className="block text-xs text-foreground/60 hover:text-amber-400">
            ← Balik ke beranda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Lock className="h-7 w-7 text-black" />
          </div>
          <h1 className="text-xl font-black">Reset Password</h1>
          <p className="text-sm text-foreground/70 mt-1">
            Masukkan password baru buat akun kamu
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Password field */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground/80">
              Password Baru
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 6 karakter, huruf + angka"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-10"
                required
                autoComplete="new-password"
                minLength={6}
                maxLength={1024}
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
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((bar) => (
                    <div
                      key={bar}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        strength.score >= bar ? strength.color : 'bg-secondary'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-foreground/60">{strength.label}</p>
                <PasswordRequirements pwd={password} />
              </div>
            )}
          </div>

          {/* Confirm password field */}
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground/80">
              Konfirmasi Password Baru
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Ulangi password baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-9"
                required
                autoComplete="new-password"
                minLength={6}
                maxLength={1024}
              />
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-400 mt-1">Password tidak cocok</p>
            )}
            {confirmPassword && password === confirmPassword && password.length >= 6 && (
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
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Mereset…</>
            ) : (
              <>Reset Password <ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </form>

        <div className="text-center">
          <Link href="/auth/login" className="text-xs text-foreground/60 hover:text-amber-400">
            ← Balik ke login
          </Link>
        </div>
      </div>
    </div>
  );
}
