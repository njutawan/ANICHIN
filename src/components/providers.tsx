'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import { I18nProvider } from '@/lib/i18n-context';
import { localeFromPathname } from '@/lib/i18n';

export function Providers({ children }: { children: React.ReactNode }) {
  // Locale awal ditentukan URL: SSR `/en` mengirim HTML bahasa Inggris
  // (bukan lagi Indonesia lalu ditukar setelah hydration).
  const pathname = usePathname();
  const initialLocale = localeFromPathname(pathname);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );
  return (
    <SessionProvider>
      <I18nProvider initialLocale={initialLocale}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </I18nProvider>
    </SessionProvider>
  );
}
