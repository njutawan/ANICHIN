// Global test setup for Vitest.
// Registers jest-dom matchers (e.g. toBeInTheDocument) onto Vitest's expect.
// Side-effect only, so it is safe for node-env test files as well.
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// `unstable_cache` dari next/cache hanya berfungsi di dalam runtime server
// Next.js (butuh incremental cache per-request). Di unit test, jadikan
// passthrough supaya loader di src/lib/data/* bisa diuji seperti fungsi biasa.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

// jsdom tidak menyediakan ResizeObserver, sementara beberapa komponen Radix
// (mis. @radix-ui/react-scroll-area di modal komentar) memakainya di layout
// effect → ReferenceError saat render. Stub no-op sudah cukup untuk unit test.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
