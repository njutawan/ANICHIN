'use client';

import { useLanguageSwitch } from '@/lib/i18n-context';
import { Globe } from 'lucide-react';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';

/**
 * Language toggle — switches between Indonesian and English.
 *
 * Di `/` dan `/en` tombol ini berpindah URL (lalu preferensi ikut tersimpan);
 * di rute netral ia menukar teks di tempat. Lihat `useLanguageSwitch`.
 *
 * Pass `className` to control responsive visibility (e.g. `hidden lg:inline-flex`).
 */
export function LanguageToggle({ className }: { className?: string } = {}) {
  const { locale, toggle } = useLanguageSwitch();
  const mounted = useMounted();

  return (
    <button
      onClick={toggle}
      aria-label={locale === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
      title={locale === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
      className={cn(
        'relative h-11 w-11 rounded-full border border-border bg-secondary/70 hover:bg-secondary text-foreground hover:text-amber-400 transition-colors flex items-center justify-center overflow-hidden focus-brand',
        className
      )}
    >
      <Globe className="h-4 w-4" />
      <span className="absolute bottom-0 right-0 text-[10px] font-bold bg-amber-500 text-black rounded-tl px-0.5 leading-none">
        {mounted ? (locale === 'id' ? 'ID' : 'EN') : 'ID'}
      </span>
    </button>
  );
}
