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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
