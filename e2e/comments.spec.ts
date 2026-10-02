import { test, expect } from '@playwright/test';

/**
 * Alur komentar end-to-end (butuh database ter-seed).
 *
 * Inilah kriteria yang diperbaiki: komentar harus **terlihat oleh pengguna
 * lain**. Sebelumnya komentar hanya tersimpan di localStorage pengirim, jadi
 * test "pengguna anonim melihat komentar" mustahil lolos.
 *
 * Dijalankan di CI dengan PostgreSQL + `bun run seed` (job `e2e`);
 * di lokal: `E2E_WITH_DB=1 bun run test:e2e`.
 */
const WITH_DB = process.env.E2E_WITH_DB === '1';
const ANIME_SLUG = 'shadow-blade';

test.describe('Komentar episode lintas pengguna', () => {
  test.skip(!WITH_DB, 'Butuh database ter-seed (jalankan dengan E2E_WITH_DB=1)');

  test('komentar yang dikirim satu pengguna terlihat oleh pengguna lain', async ({
    browser,
    playwright,
    baseURL,
  }) => {
    // --- 1. Daftar akun uji lewat API -------------------------------------
    const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
    const password = 'E2ePassword123';

    const api = await playwright.request.newContext({ baseURL });
    const registered = await api.post('/api/auth/register', {
      data: { email, password, name: 'E2E Tester' },
    });
    expect([201, 409]).toContain(registered.status());
    await api.dispose();

    // --- 2. Login lewat UI -------------------------------------------------
    const authorContext = await browser.newContext();
    const author = await authorContext.newPage();

    await author.goto('/auth/login');
    // `:visible` — konten di-stream, jadi bisa ada salinan tersembunyi.
    await author.locator('input#email:visible').fill(email);
    await author.locator('input#password:visible').fill(password);
    await author
      .getByRole('button', { name: /masuk/i })
      .filter({ visible: true })
      .first()
      .click();
    await author.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 20_000 });

    // --- 3. Buka player di halaman anime kanonik --------------------------
    await author.goto(`/anime/${ANIME_SLUG}`);
    await author.getByRole('button', { name: /tonton sekarang/i }).click();

    const authorDialog = author
      .getByRole('dialog')
      .filter({ has: author.getByPlaceholder(/bagikan pendapatmu/i) });
    await expect(authorDialog).toBeVisible();

    // --- 4. Kirim komentar -------------------------------------------------
    const comment = `komentar e2e ${Date.now()}`;
    await authorDialog.getByPlaceholder(/bagikan pendapatmu/i).fill(comment);
    await authorDialog.getByRole('button', { name: /^kirim$/i }).click();

    await expect(authorDialog.getByText(comment)).toBeVisible({ timeout: 15_000 });

    // --- 5. Pengguna lain (anonim, browser terpisah) melihat komentar itu --
    const readerContext = await browser.newContext();
    const reader = await readerContext.newPage();
    await reader.goto(`/anime/${ANIME_SLUG}`);
    await reader.getByRole('button', { name: /tonton sekarang/i }).click();

    const readerDialog = reader
      .getByRole('dialog')
      .filter({ has: reader.getByPlaceholder(/bagikan pendapatmu/i) });
    await expect(readerDialog).toBeVisible();
    await expect(readerDialog.getByText(comment)).toBeVisible({ timeout: 15_000 });

    // Pengguna anonim tidak boleh melihat tombol hapus.
    await expect(readerDialog.getByRole('button', { name: /hapus/i })).toHaveCount(0);
    // Dan tidak bisa mengirim komentar sebelum login.
    await expect(readerDialog.getByPlaceholder(/bagikan pendapatmu/i)).toBeDisabled();

    await authorContext.close();
    await readerContext.close();
  });
});
