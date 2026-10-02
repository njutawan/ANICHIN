import { test, expect } from '@playwright/test';

/**
 * Smoke test E2E — dijalankan terhadap build produksi.
 *
 * Dibagi dua:
 * - selalu jalan (routing, header keamanan/nonce, aset statis, kontrak API) —
 *   termasuk memastikan beranda **tidak 500** walau datanya gagal dimuat;
 * - butuh data (`E2E_WITH_DB=1`): sitemap dan isi beranda yang dirender server.
 *
 * Catatan: dengan database benar-benar mati, beranda tetap 200 tapi isinya
 * hanya dirender di klien (boundary Suspense jatuh ke error boundary) — sisa
 * pemanggil DB di luar loader ber-cache (`hero-slider`, `structured-data`)
 * belum punya fallback. Itu sebabnya asersi "brand terlihat" digate DB.
 */
const WITH_DB = process.env.E2E_WITH_DB === '1';

test.describe('Beranda', () => {
  test('tidak 500 walau data gagal dimuat (fallback P1-4)', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  });

  test('merender header + footer untuk pengunjung', async ({ page }) => {
    test.skip(!WITH_DB, 'Butuh data agar beranda dirender penuh (E2E_WITH_DB=1)');

    await page.goto('/');
    // Brand di header + footer (struktur, bukan data).
    await expect(page.getByRole('link', { name: /anichin/i }).first()).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('membawa security header + nonce CSP per request', async ({ page }) => {
    const res = await page.goto('/');
    const headers = res!.headers();
    const csp = headers['content-security-policy'] ?? '';

    expect(csp).toContain("'nonce-");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('nonce di header benar-benar dipakai script di HTML', async ({ request }) => {
    // Dibaca dari body mentah, bukan DOM: browser menyembunyikan nilai atribut
    // `nonce` (getAttribute('nonce') selalu "") sehingga asersi DOM mustahil.
    const res = await request.get('/', { headers: { accept: 'text/html' } });
    const csp = res.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();

    const html = await res.text();
    expect(html).toMatch(/<script[^>]*nonce=/);
    expect(html).toContain(`nonce="${nonce}"`);
  });
});

test.describe('Locale & routing', () => {
  test('/en memakai lang="en" + Content-Language', async ({ page }) => {
    const res = await page.goto('/en');
    expect(res?.status()).toBe(200);
    expect(res!.headers()['content-language']).toBe('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('/ja dialihkan permanen ke /', async ({ page }) => {
    await page.goto('/ja');
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('/ja/<path> dialihkan ke <path>', async ({ page }) => {
    await page.goto('/ja/offline');
    expect(new URL(page.url()).pathname).toBe('/offline');
  });

  test('halaman tidak dikenal mengembalikan 404', async ({ page }) => {
    const res = await page.goto('/halaman-yang-tidak-ada-e2e');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /halaman tidak ditemukan/i })).toBeVisible();
  });
});

test.describe('Halaman statis & auth', () => {
  test('/offline dapat diakses tanpa login', async ({ page }) => {
    await page.goto('/offline');
    await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible();
  });

  test('/auth/login menampilkan form login', async ({ page }) => {
    await page.goto('/auth/login');

    // `:visible` supaya tahan terhadap konten Suspense yang di-stream
    // (selama hidrasi sempat ada salinan tersembunyi di DOM).
    await expect(page.locator('input#email:visible')).toHaveCount(1);
    await expect(page.locator('input#password:visible')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: /masuk/i }).filter({ visible: true }).first()
    ).toBeVisible();
  });

  test('/admin dialihkan ke login (belum ada sesi)', async ({ page }) => {
    await page.goto('/admin');
    expect(new URL(page.url()).pathname).toBe('/auth/login');
  });
});

test.describe('SEO & PWA', () => {
  test('robots.txt memblokir /admin', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('/admin');
    expect(body).toContain('Sitemap:');
  });

  test('sitemap.xml valid & tanpa URL fragmen', async ({ request }) => {
    // Sitemap membaca daftar anime dari database (tanpa fallback).
    test.skip(!WITH_DB, 'Butuh database (E2E_WITH_DB=1)');

    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('<urlset');
    expect(body).not.toContain('#');
  });

  test('manifest.webmanifest terpasang', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const manifest = (await res.json()) as { name?: string; start_url?: string };
    expect(manifest.name).toContain('AniChin');
    expect(manifest.start_url).toBeTruthy();
  });

  test('/sw.js disajikan sebagai JavaScript dengan versi cache dari build id', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('javascript');
    expect(res.headers()['cache-control']).toContain('no-store');

    const body = await res.text();
    // P2: versi tidak lagi manual — disuntikkan saat build.
    expect(body).toMatch(/const CACHE_VERSION = 'anichin-[^']+';/);
    expect(body).not.toContain('__CACHE_VERSION__');
    expect(body).toContain("self.addEventListener('fetch'");
  });
});

test.describe('Image optimizer (whitelist host)', () => {
  test('menolak host di luar whitelist', async ({ request }) => {
    const res = await request.get(
      '/_next/image?url=https%3A%2F%2Fimg.attacker.test%2Fgambar.png&w=256&q=75'
    );
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain('not allowed');
  });

  test('tetap melayani gambar lokal', async ({ request }) => {
    // w harus salah satu ukuran yang diizinkan (deviceSizes/imageSizes),
    // kalau tidak Next menolaknya dengan 400 "width is not allowed".
    const res = await request.get('/_next/image?url=%2Ficon-192.png&w=256&q=75');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  });
});

test.describe('Kontrak API komentar', () => {
  test('GET tanpa parameter → daftar kosong (backward compatible)', async ({ request }) => {
    const res = await request.get('/api/comments');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ comments: [], hasMore: false, nextCursor: null });
  });

  test('GET dengan slug + episode → bentuk respons paginasi', async ({ request }) => {
    test.skip(!WITH_DB, 'Query komentar butuh database (E2E_WITH_DB=1)');

    const res = await request.get('/api/comments?animeSlug=shadow-blade&episodeNumber=1');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { comments: unknown[]; hasMore: boolean; nextCursor: unknown };
    expect(Array.isArray(body.comments)).toBe(true);
    expect(typeof body.hasMore).toBe('boolean');
    expect(body).toHaveProperty('nextCursor');
  });

  test('GET dengan parameter tidak valid → 400', async ({ request }) => {
    const res = await request.get('/api/comments?animeSlug=shadow-blade&episodeNumber=abc');
    expect(res.status()).toBe(400);
  });

  test('POST tanpa sesi → 401 (komentar butuh login)', async ({ request }) => {
    const res = await request.post('/api/comments', {
      data: { animeSlug: 'shadow-blade', episodeNumber: 1, comment: 'tes tanpa login' },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE tanpa sesi → 401 (bukan 500)', async ({ request }) => {
    const res = await request.delete('/api/comments/apa-saja');
    expect(res.status()).toBe(401);
  });
});
