'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `false` during SSR / first render, `true` after mount.
 * Uses useState + useEffect (the classic mount-detection pattern).
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
