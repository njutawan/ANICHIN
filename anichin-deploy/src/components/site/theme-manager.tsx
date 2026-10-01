'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/lib/store';

/**
 * Syncs the persisted theme from Zustand to the <html> element's classList.
 * The inline script in layout.tsx pre-applies the class before hydration
 * to prevent a flash of wrong theme. This component keeps it in sync after
 * any theme change. Renders nothing. Mount once near the root.
 */
export function ThemeManager() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
  }, [theme]);

  return null;
}
