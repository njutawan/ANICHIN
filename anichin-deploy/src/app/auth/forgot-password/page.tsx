'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, ArrowRight, Loader2, Flame, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  const validateEmail = (val: string) => {
    setEmail(val);
    if (!val) { setEmailError(''); return; }
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val)) {
      setEmailError('Format email tidak valid');
    } else {
      setEmailError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || emailError) return;
    setLoading(true);

    try {
      const _res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      // Always show success (anti-enumeration: don't reveal if email exists)
      setSent(true);
      toast.success('Instruksi reset password telah dikirim (jika email terdaftar).');
    } catch {
      setSent(true);
      toast.success('Instruksi reset password telah dikirim (jika email terdaftar).');
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-green-500/15 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-green-400" />
          </div>
          <h1 className="text-xl font-black">Cek Email Kamu</h1>
          <p className="text-sm text-foreground/70">
            Kalau email <span className="font-semibold text-foreground">{email}</span> terdaftar,
            instruksi reset password sudah dikirim. Cek inbox (dan folder spam).
          </p>
          <div className="space-y-2">
            <Link href="/auth/login">
              <Button className="w-full bg-amber-500 text-black hover:bg-amber-400 font-bold h-11">
                Kembali ke Login
              </Button>
            </Link>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-sm text-foreground/60 hover:text-amber-400"
            >
              Coba email lain
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Flame className="h-7 w-7 text-black" />
          </div>
          <h1 className="text-xl font-black">Lupa Password?</h1>
          <p className="text-sm text-foreground/70 mt-1">
            Masukkan email kamu, kami kirim link reset password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="forgot-email" className="text-sm font-medium text-foreground/80">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input
                id="forgot-email"
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

          <Button
            type="submit"
            disabled={loading || !email || !!emailError}
            className="w-full bg-amber-500 text-black hover:bg-amber-400 font-bold h-11"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Mengirim…</>
            ) : (
              <>Kirim Link Reset <ArrowRight className="h-4 w-4 ml-1" /></>
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
