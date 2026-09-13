'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker for PWA offline support.
 * Registers in both dev and production (dev was disabled before, now enabled
 * for testing PWA install functionality).
 *
 * Listens for updates and prompts user to refresh when new SW is available.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });

        // Log for debugging
        if (process.env.NODE_ENV !== 'production') {
          console.log('[SW] registered ✅', reg.scope);
        }

        // Listen for new service worker waiting to activate
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // New version available — tell the waiting SW to skip waiting
              newWorker.postMessage('SKIP_WAITING');
              if (process.env.NODE_ENV !== 'production') {
                console.log('[SW] new version installed, will activate on next navigation');
              }
            }
          });
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[SW] registration failed ❌', err);
        }
      }
    };

    // Register after page load (don't block initial render)
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
