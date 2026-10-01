'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { useCallback } from 'react';

/**
 * Web Vitals reporter — captures Core Web Vitals (LCP, INP, CLS, FCP, TTFB)
 * and sends them to the analytics endpoint.
 *
 * In production, this feeds into Vercel Analytics / Google Analytics / custom backend.
 * In development, logs to console for debugging.
 *
 * Metrics:
 * - LCP (Largest Contentful Paint): target < 2.5s
 * - INP (Interaction to Next Paint): target < 200ms
 * - CLS (Cumulative Layout Shift): target < 0.1
 * - FCP (First Contentful Paint): target < 1.8s
 * - TTFB (Time to First Byte): target < 800ms
 */
export function WebVitals() {
  const handleVital = useCallback((metric: any) => {
    const { name, value, id, rating } = metric;

    // Development: log to console
    if (process.env.NODE_ENV !== 'production') {
      const emoji =
        rating === 'good' ? '✅' : rating === 'needs-improvement' ? '⚠️' : '❌';
      console.log(`${emoji} ${name}: ${Math.round(value)}ms (${rating}) [${id}]`);
      return;
    }

    // Production: batch + send to analytics endpoint
    const payload = JSON.stringify({
      name,
      value: Math.round(value),
      rating,
      id,
      page: window.location.pathname,
      ts: Date.now(),
    });

    // Use sendBeacon for reliability (survives page unload)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/web-vitals', blob);
    } else {
      fetch('/api/web-vitals', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  useReportWebVitals(handleVital);

  return null;
}
