import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // default for lib/API tests
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
    setupFiles: ['./src/test/setup.ts'],
    // Component tests (`.test.tsx`) override the default node env via a
    // per-file `// @vitest-environment jsdom` pragma at the top of each file.
    // (vitest 5 removed `environmentMatchGlobs` in favour of these pragmas,
    // the `projects` field, or the `// @vitest-environment nuxt` style.)
    env: {
      // Stable AES-256-GCM key (64 hex chars = 32 bytes) for 2FA tests.
      // Generated once, committed — only used by the test suite.
      TWO_FACTOR_ENCRYPTION_KEY: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      // Ensure dev-only fallback paths are exercised (not production guards).
      NODE_ENV: 'test',
    },
    /**
     * Coverage (P2). Sebelumnya CI mengunggah folder `coverage/` yang tidak
     * pernah dibuat — tidak ada `@vitest/coverage-v8` maupun threshold, jadi
     * artefak selalu kosong. `test:coverage` dipakai job `test` di CI.
     *
     * Threshold di bawah adalah **penjaga regresi**, bukan target: angkanya
     * diset beberapa poin di bawah hasil nyata (65% statements / 68% lines)
     * supaya penambahan kode yang belum teruji tidak langsung memerahkan CI,
     * tapi penurunan cakupan yang signifikan akan terlihat.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'json-summary'],
      thresholds: {
        statements: 58,
        branches: 52,
        functions: 50,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
