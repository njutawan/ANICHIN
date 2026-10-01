'use client';

import { WebVitals } from '@/components/web-vitals';
import { ServiceWorkerRegister } from '@/components/sw-register';

/**
 * Client-only enhancement components — rendered together in one boundary.
 *
 * These are bundled into the client chunk (marked 'use client') so they
 * never execute on the server. Avoids SSR errors with `next/web-vitals`
 * and `navigator.serviceWorker` (browser-only APIs).
 */
export function ClientEnhancements() {
  return (
    <>
      <WebVitals />
      <ServiceWorkerRegister />
    </>
  );
}
