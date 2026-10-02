import { defineConfig, devices } from '@playwright/test';

/**
 * Konfigurasi E2E (Playwright).
 *
 * Yang diuji: perilaku nyata di browser terhadap **build produksi** (bukan dev
 * server) — header keamanan/nonce CSP, redirect `/ja`, `<html lang>`, PWA
 * (`/sw.js` + manifest), penolakan image optimizer, kontrak API komentar, dan
 * (kalau `E2E_WITH_DB=1`) alur komentar lintas pengguna.
 *
 * Catatan sandbox: `bunx playwright install chromium` butuh jaringan ke CDN
 * Playwright. Di CI (GitHub Actions) jalan; di sandbox yang memblokir CDN,
 * cukup verifikasi dengan `playwright test --list` + curl manual.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const IS_CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  workers: IS_CI ? 2 : undefined,
  reporter: IS_CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build standalone produksi + serve. `reuseExistingServer` membuat
    // iterasi lokal cepat (server yang sudah jalan dipakai ulang).
    command: 'node scripts/build.js && node .next/standalone/server.js',
    // /offline selalu 200 (tidak bergantung DB) → penanda server siap.
    url: `${BASE_URL}/offline`,
    reuseExistingServer: !IS_CI,
    timeout: 300_000,
    env: {
      NODE_ENV: 'production',
      DEPLOY_TARGET: 'standalone',
      PORT: String(PORT),
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID ?? 'e2e',
      NEXTAUTH_URL: BASE_URL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'e2e-only-secret-0123456789abcdef',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://anichin:anichin@localhost:5433/anichin?schema=public',
    },
  },
});
