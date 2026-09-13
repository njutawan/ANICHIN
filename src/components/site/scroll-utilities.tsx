'use client';

import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMounted } from '@/hooks/use-mounted';
import { useI18n } from '@/lib/i18n-context';

/**
 * Fixed scroll progress bar at top of viewport + back-to-top button.
 * Renders nothing during SSR (mounted check) to avoid hydration mismatch.
 */
export function ScrollUtilities() {
  const { t } = useI18n();
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const mounted = useMounted();

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
      setProgress(pct);
      setShowTop(scrollTop > 600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* Scroll progress bar — fixed at very top */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-transparent pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-brand via-amber-400 to-brand transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Back to top button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label={t('common.backToTop')}
        title={t('common.backToTop')}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-11 w-11 rounded-full border border-brand/40 bg-brand/90 backdrop-blur-md text-brand-foreground shadow-lg shadow-brand/30 hover:bg-brand hover:scale-110 transition-all flex items-center justify-center',
          showTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </>
  );
}
