'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Chrome, Github, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type Provider = {
  id: 'google' | 'github';
  name: string;
  icon: string;
};

/**
 * OAuthButtons — renders OAuth sign-in buttons for all configured providers.
 *
 * Fetches the list of active providers from /api/auth/oauth-providers,
 * so buttons only show when the provider is actually configured.
 *
 * Usage:
 *   <OAuthButtons />
 *   <OAuthButtons callbackUrl="/" />
 *
 * Optional props:
 *   - callbackUrl: where to redirect after sign-in (default: '/')
 *   - label: verb prefix on button (default: 'Masuk dengan')
 */
export function OAuthButtons({
  callbackUrl = '/',
  label = 'Masuk dengan',
}: {
  callbackUrl?: string;
  label?: string;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/oauth-providers', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { providers?: Provider[] }) => {
        if (mounted) {
          setProviders(data.providers ?? []);
          setFetched(true);
        }
      })
      .catch(() => {
        // Silent fail — just don't render OAuth buttons
        if (mounted) setFetched(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleOAuth = (provider: 'google' | 'github') => {
    setLoading(true);
    try {
      signIn(provider, { callbackUrl });
    } catch {
      toast.error('Gagal memulai OAuth sign-in');
      setLoading(false);
    }
  };

  // Show nothing while fetching (avoid layout shift)
  if (!fetched) return null;

  // Show nothing if no providers configured
  if (providers.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Divider */}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-foreground/60">atau</span>
        </div>
      </div>

      {/* OAuth buttons */}
      {providers.map((provider) => {
        const Icon = provider.id === 'google' ? Chrome : Github;
        return (
          <Button
            key={provider.id}
            onClick={() => handleOAuth(provider.id)}
            disabled={loading}
            variant="outline"
            className="w-full h-11 transition-colors"
            aria-label={`${label} ${provider.name}`}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Icon className="h-4 w-4 mr-2" />
            )}
            {label} {provider.name}
          </Button>
        );
      })}

      {/* Privacy notice */}
      <p className="text-center text-[10px] text-foreground/50 mt-2 leading-tight">
        Dengan masuk via OAuth, kamu menyetujui{' '}
        <a href="/terms" className="underline hover:text-foreground/70">
          Ketentuan Layanan
        </a>{' '}
        &{' '}
        <a href="/privacy" className="underline hover:text-foreground/70">
          Kebijakan Privasi
        </a>
        .
      </p>
    </div>
  );
}
