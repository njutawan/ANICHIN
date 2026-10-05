# AniChin — Code Review & Gap Analysis

**Tanggal:** 2026-10-02
**Commit:** `65075332567368f2ab857380e2c47071b5146429` (branch `arena/01a0fd0b-anichin`)
**Cakupan:** 172 file di `src/` (~23.700 LOC TS/TSX), `prisma/`, `next.config.ts`, CI/Docker, dependensi.

---

## 0. Hasil verifikasi yang bisa dijalankan

| Pemeriksaan | Hasil (setelah perbaikan) |
| --- | --- |
| `bunx tsc --noEmit` | ✅ 0 error |
| `bun run lint` | ✅ 0 error, 0 warning |
| `bunx vitest run` | ✅ **266 test lulus** (28 file) — naik dari 118 (148 test baru) |
| `bun audit` | ✅ **0 vulnerability** (sebelumnya 14: 4 high) |
| `next build` (Turbopack) | ✅ sukses, route `/anime/[slug]` terdaftar sebagai dynamic |
| `next build --webpack` | ✅ sukses (validasi tipe route Next dijalankan) |
| `next build --webpack` **tanpa** `@next/bundle-analyzer` | ✅ sukses (P1-12) — konfigurasi tetap dimuat & lolos type-check; `ANALYZE=true` hanya memunculkan peringatan lalu build lanjut, tidak crash |
| `node scripts/build.js --webpack` tanpa Bun di PATH | ✅ sukses (P1-12) — memakai `node_modules/.bin/{prisma,next}`, jadi `npm run build` tidak lagi butuh Bun |
| E2E Playwright (23 test, 2 file) | ✅ daftar & smoke dijalankan terhadap **build produksi standalone**: `/` 200 walau DB mati, CSP+nonce dipakai script, `/en` `lang="en"`, `/ja` 308, 404, `/auth/login`, `/admin` → login, robots/sitemap/manifest/`/sw.js` (`anichin-e2e`), image optimizer host asing **400** & lokal **200**, kontrak API komentar (GET/400/401). Browser tidak bisa diunduh di sandbox ini (CDN diblokir) → eksekusi penuh ada di CI (job `e2e`), di sini diverifikasi via `playwright test --list` + curl terhadap server standalone yang sama |
| Smoke test dev server | ✅ CSP + `x-nonce` konsisten dengan nonce di HTML, poster SVG tersaji langsung, `/ja` → **308** ke `/`, `/en` → `<html lang="en">` + `Content-Language: en`, rute lain `lang="id"` |
| CI GitHub Actions (PR #6) | ✅ Lint & Type-check · Unit Tests · Security Audit · Build · Docker Build **hijau** |
| Verifikasi runtime penuh (DB) | 🟡 Embedded PG **berhasil boot** lewat `SEED=1 bun run scripts/start-postgres.ts` (listen di 5433, database `anichin` dibuat) — langkah `prisma generate/migrate/seed` tetap butuh unduhan engine dari `binaries.prisma.sh` yang diblokir sandbox. Jalankan script yang sama di mesin lokal untuk uji end-to-end. |

> Catatan CI: check **CodeQL** (default setup dari app `github-advanced-security`) gagal dalam ~3 detik pada PR ini. Ini kegagalan konfigurasi repositori (code scanning butuh GitHub Advanced Security untuk repo privat), bukan akibat perubahan kode — matikan default setup di *Settings → Code security* atau sediakan runner CodeQL bila diinginkan.

> Catatan sandbox: `next/font/google` butuh akses `fonts.googleapis.com` saat build → verifikasi build memakai mock resmi Next (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`) / penggantian font sementara yang sudah dikembalikan.

---

## 0b. Status perbaikan (PR ini)

Legenda: ✅ diperbaiki · 🟡 sebagian / perlu tindak lanjut · ⬜ belum

| ID | Temuan | Status | Bukti / catatan |
| --- | --- | --- | --- |
| P0-1 | `nodemailer` rentan (13 advisory high) | ✅ | Bump ke `nodemailer@^10.0.13` (bundled types, Node ≥20) + `@types/nodemailer` dihapus; `bun audit` → 0 vuln |
| P0-1b | Advisory `deepmerge-ts` lewat `@prisma/config` | ✅ | Override **terarah** `{"@prisma/config": {"deepmerge-ts": "^8.0.2"}}` — diverifikasi `prisma validate` + `prisma generate` tetap jalan |
| P0-1c | Gate audit CI tidak pernah memblokir | ✅ | `.github/workflows/ci.yml`: `continue-on-error` dihapus untuk `bun audit --production`; job `security` diberi `permissions: security-events: write` |
| P0-2 | `overrides` minimatch v3/picomatch v2 global merusak paket modern | ✅ | `overrides` lama dihapus; diganti override nested satu-paket (lihat P0-1b) |
| P0-3 | `/api/health` membocorkan pesan error DB | ✅ | Hanya `DB_UNAVAILABLE` ke klien, detail ke `logger.error`; test diperbarui |
| P0-4 | Rate limit/lockout bisa di-spoof via `X-Forwarded-For` | ✅ | `src/lib/ip.ts` (header edge → XFF dari kanan sesuai `TRUSTED_PROXY_HOPS`, validasi format IP) + 11 unit test; dipakai di rate-limit, auth, search, anime detail |
| P0-4b | Limiter in-memory saat multi-instance | 🟡 | Sudah ada Redis opsional; **wajibkan** `REDIS_URL` di produksi masih perlu keputusan ops |
| P0-5 | Tidak ada halaman anime yang bisa diindeks | ✅ | Route baru `src/app/anime/[slug]/page.tsx` (server-rendered: judul, sinopsis, episode, ulasan, JSON-LD, breadcrumb, internal link); `generateMetadata` canonical/OG per anime; sitemap diperbaiki (hapus URL fragmen & `/?anime=`, tanpa `take: 100`); kartu anime kini `<Link href="/anime/<slug>">` sungguhan |
| P0-6 | Sentry tidak pernah aktif di browser | ✅ | `src/instrumentation-client.ts` (konvensi SDK v10 + `onRouterTransitionStart`); file `sentry.*.config.ts` yang mati dihapus |
| P0-7 | `/ja` palsu + `<html lang>` salah | ✅ | **(a)** `/ja` dihapus + redirect permanen 308 → `/` (dan `/ja/*` → `/*`) agar URL lama tidak 404; entri `ja-JP` di hreflang & sitemap dibuang. **(b)** `<html lang>` tidak lagi hardcoded: proxy meneruskan `x-locale`, root layout membacanya (`/en` → `lang="en"` + `Content-Language: en`). **(c)** bahasa kini ditentukan URL: provider i18n menerima `initialLocale`, jadi `/en` **dirender Inggris sejak SSR** (sebelumnya Indonesia lalu ditukar setelah hydration). **(d)** toggle bahasa berpindah URL di `/` dan `/en` (query string dipertahankan), di rute netral tetap menukar teks di tempat. +19 test |
| P0-8 | Domain hardcoded 27× + env server di client | ✅ | `src/lib/site.ts` (`NEXT_PUBLIC_SITE_URL` → `NEXTAUTH_URL` → default) dipakai di 16 file; `anime-detail-modal` tidak lagi memakai `NEXTAUTH_URL` di browser; `.env.example` diperbarui; terbukti di smoke test (`Host: http://localhost:3000`) |
| P1-1 | GET komentar/ulasan tanpa batas + validasi ≠ penyimpanan | ✅ | `src/lib/validation.ts` (Zod) + paginasi cursor (`limit+1`, `hasMore`, `nextCursor`); batas validasi = batas simpan (300/500); sanitasi per code point (`sanitizeUserText`); 13 test route baru |
| P1-2 | `jsonld`/`og` tanpa rate limit & tanpa validasi slug | ✅ | Keduanya kini rate-limited + validasi slug + `auditLog`; logika dipusatkan di `src/lib/anime-seo.ts` |
| P1-3 | JSON-LD inline tanpa nonce (CSP `strict-dynamic`) | ✅ | `layout.tsx` + `structured-data.tsx` membaca `x-nonce`; terbukti nonce HTML == nonce header saat smoke test |
| P1-4 | Homepage `force-dynamic` + 25 `useQuery` | ✅ | Prefetch RSC + hidrasi TanStack Query: kunjungan pertama **0 request API** untuk data homepage (sebelumnya ~17) dan **0 query DB** selama TTL cache. Data penting dikirim sebagai props → ada di HTML. `force-dynamic` **sengaja dipertahankan** (nonce CSP butuh HTML dinamis) — yang di-cache adalah datanya (`unstable_cache`), sesuai catatan review. Satu loader gagal ≠ halaman 500 (payload kosong + log). Detail di §P1-4 |
| P1-5 | `images.remotePatterns: '**'` | ✅ | Whitelist di `src/lib/image-hosts.ts`: default `s4.anilist.co`, `cdn.myanimelist.net`, `image.tmdb.org` + tambahan lewat `NEXT_PUBLIC_IMAGE_HOSTS` (koma/spasi, mendukung URL utuh & wildcard). Terverifikasi: host asing → **400 `"url" parameter is not allowed`**, host whitelist → lolos (fetch dicoba), gambar lokal tetap dioptimasi (200 PNG). Poster dari host tak terdaftar tetap tampil lewat `unoptimized` (langsung dari sumbernya), jadi data admin tidak rusak. **Perlu masukan Anda:** daftar CDN/CDN streaming final untuk dimasukkan ke env produksi |
| P1-6 | 16 dependency tak terpakai + README tidak akurat | ✅ | 18 paket dihapus dari `package.json` + `bun.lock` diregenerasi; README diperbaiki (Framer Motion/Zod); zod kini benar-benar dipakai |
| P1-7 | Audit log: `appendFileSync` + hash IP tanpa salt | ✅ | Antrean `fs.promises.appendFile`, rotasi async, HMAC-SHA256 + `IP_HASH_SALT` |
| P1-8 | Index DB kurang | ✅ | Migrasi `20261002000000_add_perf_indexes` + `schema.prisma` (3 index) |
| P1-9 | `package.json#prisma` deprecated + `.env` tidak dibaca CLI | ✅ | Field dihapus; `import 'dotenv/config'` di `prisma.config.ts` |
| P1-10 | `/admin` bisa diindeks | ✅ | `src/app/admin/layout.tsx` (noindex) + `robots.ts` men-disallow `/admin`, `/auth/`, `/offline` |
| P1-11 | Test minim di jalur kritikal | 🟡 | +51 test (route API, IP resolver, SEO builder, komponen halaman). E2E Playwright & threshold coverage belum |
| P1-12 | `next.config.ts` import devDependency + `build.js` pakai `bunx` | ✅ | Config diekspor sebagai fungsi async + `await import()` lazy (analyzer hanya saat `ANALYZE=true`); `build.js` memakai resolver binary lokal → `bunx` → `npx`; direktori mati `/app/db` dihapus. Diverifikasi dengan devDependency dihilangkan **dan** build tanpa Bun di PATH |
| **BARU** | `next build` **gagal**: `export { isValidEmail }` di route `reset-password` | ✅ | Ditemukan saat verifikasi build — export ilegal untuk route file; dihapus |
| **BARU** | Poster SVG ditolak image optimizer (HTTP 400) → semua poster tampil placeholder | ✅ | `AnimeImage` menyajikan SVG/data-URI dengan `unoptimized`; 4 test baru |
| **BARU** | `proxy.ts` mengecualikan seluruh prefix `anime/` → halaman baru tanpa security header & nonce | ✅ | Matcher dipersempit ke berkas gambar (`anime/*.{svg,png,…}`) |
| **BARU** | `scripts/start-postgres.ts` masih era SQLite (rusak) | ✅ | Ditulis ulang untuk PostgreSQL-only + langkah seed opsional |
| **BARU** | Script di atas **tetap tidak jalan** meski sudah ditulis ulang: opsi `pgPort` tidak dikenal `embedded-postgres` (namanya `port`) sehingga PG listen di 5432 sementara `.env` menunjuk 5433, dan `user`/`password` tidak pernah diteruskan sehingga kredensial `anichin` tidak ada | ✅ | Opsi diperbaiki (`port`/`user`/`password`/`authMethod`); diverifikasi dengan menjalankan script: PG listen di **5433**, database `anichin` dibuat |
| **BARU** | 4 test SEO gagal hanya di CI (`NEXTAUTH_URL` CI terbaca saat module load) | ✅ | `vi.hoisted()` menetralkan env URL di `anime-seo.test.ts`; lokal & CI hijau |
| **P2 lanjutan** | Daftar komentar/ulasan di-cache CDN (`s-maxage=60`) → komentar yang baru dikirim bisa tidak terlihat sampai ~1 menit (termasuk oleh penulisnya) | ✅ | Kedua GET memakai `Cache-Control: no-store`; paginasi memakai urutan stabil `[{createdAt:'desc'},{id:'desc'}]` (sebelumnya kunci tunggal → baris bisa terlewat/ganda antar halaman); cursor tak dikenal kini `400` (bukan `500`) lewat helper `src/lib/prisma-errors.ts`; slug GET komentar divalidasi seperti POST |
| **P2 lanjutan** | `DELETE /api/reviews` tidak ada, tapi tombol "Hapus" memanggilnya — dan syarat tampilnya salah (`session.user.id === review.user.name`) sehingga penulis tidak pernah bisa menghapus ulasannya sendiri | ✅ | Route baru `src/app/api/reviews/[id]/route.ts` (penulis/admin; 403/404/400/429 konsisten dengan komentar) + `reviews-tab.tsx` memakai `review.userId`, memanggil endpoint baru, dan menampilkan pesan error (sebelumnya respons gagal diabaikan tanpa toast) |
| **P2 lanjutan** | Beranda kehilangan hampir seluruh HTML saat DB down (`hero-slider` & `structured-data` melempar → error boundary) | ✅ | Keduanya dengan fallback: hero `null` + log, JSON-LD tetap statis (breadcrumb/FAQ); `/en` ikut sehat karena memakai komponen yang sama |
| **P2 lanjutan** | `structured-data.tsx` masih memakai URL lama `/?anime=<slug>` (canonical = beranda) untuk `url` JSON-LD | ✅ | Kini `${SITE_URL}/anime/<slug>` (`animeUrl()`); test mengunci `https://anichin.id/anime/shadow-blade` |
| **P2 lanjutan** | CI mengunggah artefak `coverage/` yang **tidak pernah dibuat** (tidak ada provider coverage/threshold) | ✅ | `@vitest/coverage-v8` + `coverage.thresholds` (58/52/50/60, sedikit di bawah hasil nyata 65,5%/59,2%/56,3%/67,7%) + skrip `test:coverage` yang dipakai job `test`; artefak kini berisi `lcov.info` + `lcov-report/` |
| **P2 lanjutan** | Repo hygiene: template PR/issue & CODEOWNERS belum ada; **private vulnerability reporting repo ini masih `disabled`** padahal itu kanal utama di `SECURITY.md` | ✅ *(kecuali PVR)* | `CODEOWNERS`, `pull_request_template.md`, `ISSUE_TEMPLATE/{config,bug_report}.yml` (mengarahkan kerentanan ke advisory, bukan issue publik) + `SECURITY.md` menjelaskan cara maintainer mengaktifkan PVR, izin token yang dibutuhkan, dan kanal fallback-nya. **PVR sendiri masih `disabled`** — diverifikasi ulang 2026-10-05 (`GET .../private-vulnerability-reporting` → `{"enabled":false}`); `PUT` dan `PATCH /repos/...` sama-sama `403 Resource not accessible by integration` karena token GitHub App/Arena tidak punya **Administration: write** (`X-Accepted-Github-Permissions: administration=write`). **Perlu tindakan Anda:** aktifkan di Settings → Code security, atau beri izin Administration: write ke App-nya. Helper: `scripts/setup-private-vulnerability-reporting.sh` |
| **P2 lanjutan** | Klaim palsu UI: label "Suka" selalu tampil di komentar walau tidak bisa diklik (tidak ada endpoint likes) | ✅ | Chip suka hanya dirender kalau `likes > 0`; test mengunci perilakunya |
| **P2 lanjutan** | `ai.txt`/`llms.txt` tidak menyebut rute kanonik `/anime/<slug>`; `ai.txt` meng-disallow `/api/admin/` (noise — robots + auth sudah menutupnya) | ✅ | Keduanya diperbarui. Catatan: klaim fitur **download** ternyata **akurat** (tab Download + `download480/720/1080` ada di produk) sehingga tidak dihapus |

### Sisa pekerjaan (rekomendasi urutan)

1. **Temuan baru saat P2 — sudah dikerjakan semua (lihat tabel di bawah):**
   - ~~Beranda **tetap 200** tanpa database, tapi isinya tidak ter-render di server~~ → ✅ `hero-slider.tsx` & `structured-data.tsx` sekarang punya fallback (hero dilewati + JSON-LD statis) sehingga beranda tidak lagi jatuh ke error boundary. 4 test baru.
   - ~~`DELETE /api/reviews` **tidak ada**, padahal UI ulasan menampilkan tombol Hapus~~ → ✅ route `DELETE /api/reviews/[id]` + UI diperbaiki (9 test).
   - ~~Threshold coverage Vitest belum diisi; template PR/issue & CODEOWNERS belum ada~~ → ✅ `@vitest/coverage-v8` + threshold + `test:coverage` dipakai CI; `CODEOWNERS`, template PR, dan template issue ditambahkan.
2. **Kalau nanti mau pasar Jepang** — tambahkan kamus `ja` sungguhan (termasuk terjemahan judul/sinopsis dari sumber data), lalu hapus redirect `/ja` dan daftarkan `ja` di `ROUTE_LOCALES` (src/lib/i18n.ts) + hreflang/sitemap.
3. **Aktifkan private vulnerability reporting** (butuh maintainer; tidak bisa dari kode/otomasi) — selama `disabled`, kanal utama `SECURITY.md` mati dan pelapor jatuh ke DM. Verifikasi & aktifkan dengan `./scripts/setup-private-vulnerability-reporting.sh` / `--enable` (butuh token dengan **Administration: read and write**), atau lewat UI: <https://github.com/njutawan/ANICHIN/settings/security_analysis>. Ini satu-satunya blocker yang tersisa dari P2.

---

**Yang sudah bagus dan jangan diutak-atik tanpa alasan:** 2FA (TOTP + backup code terenkripsi AES-256-GCM), rate limiting 3-tier + login lockout, CSP nonce, 11 security header di `src/proxy.ts`, anti-enumeration di auth, audit log, `requireAdmin()` di semua route admin, multi-stage Dockerfile + healthcheck, dan `docs/` yang lumayan rapi.

---

## P0 — Perlu segera (blocking / risiko nyata)

### P0-1. Dependency punya kerentanan high
```
nodemailer <=10.0.5   → 13 advisory high (SMTP command injection, CRLF header injection,
                        SSRF/file-read, DoS O(n²) addressparser, dll)
prisma / @prisma/config → deepmerge-ts stack exhaustion (dev/CLI, bukan runtime)
```
- **Bukti:** `npm audit --omit=dev` melaporkan 4 high; `package.json:58` `"nodemailer": "^7.0.7"`.
- **Dampak:** `nodemailer` dipakai untuk email verifikasi & reset password (`src/lib/email.ts`) — jalur yang menerima input pengguna (alamat email tujuan).
- **Fix:** naikkan `nodemailer` ke versi patched (npm menyarankan `10.0.13`, breaking) dan `prisma` ke 6.x terbaru/7 saat siap. Sesudah bump, uji manual: register → email verifikasi → reset password.
- **Kenapa lolos CI:** job `security` di `.github/workflows/ci.yml` memakai `continue-on-error: true` untuk `bun audit` **dan** CodeQL → gate tidak pernah memblokir.

### P0-2. `overrides` npm merusak dependensi modern (bug nyata, terbukti)
```jsonc
// package.json:102-109
"overrides": {
  "brace-expansion": "^1.1.17",
  "minimatch": "^3.1.3",     // ← memaksa v3 untuk SEMUA paket
  "picomatch": "^2.3.2",     // ← memaksa v2 untuk SEMUA paket
  ...
}
```
- **Bukti empiris:** `glob@13.0.6` (dipakai `@sentry/bundler-plugin-core`) butuh `minimatch@^10`, tapi yang terpasang `minimatch@3.1.5` → `require('glob').minimatch === undefined`, `brace-expansion` juga dipaksa v1. Ini API glob v13 rusak.
- **Dampak:** tooling build/source-map Sentry dan paket lain yang butuh minimatch v9+/brace-expansion v2 bisa gagal diam-diam — gejalanya baru muncul saat build produksi.
- **Fix:** hapus override ini. Kalau tujuannya menambal advisory, pakai **scoped override** (nested) hanya untuk paket rentan, mis.
  `"overrides": { "paket-rentan": { "minimatch": "^10" } }`.

### P0-3. `/api/health` membocorkan pesan error internal ke publik
```ts
// src/app/api/health/route.ts:29
checks.db = { status: 'fail', error: err instanceof Error ? err.message : 'unknown' };
```
- **Dampak:** endpoint ini publik, tanpa auth, dan tidak di-rate-limit. Saat DB down, penyerang melihat pesan Prisma mentah (host, port, nama database, kadang potongan kredensial/DSN) — informasi yang berguna untuk langkah berikutnya.
- **Fix:** kembalikan hanya `{ status: 'fail' }` (atau kode error generik) ke klien; detail lengkap → `logger.error` / audit log (sudah ada). Pertimbangkan juga menyembunyikan `environment`/`version` dari respons publik.

### P0-4. Rate limiter & lockout bisa dilewati
```ts
// src/lib/rate-limit.ts:34
const forwarded = req.headers.get('x-forwarded-for');   // dipercaya mentah
```
- **Dampak #1 (spoofing):** `X-Forwarded-For` adalah header yang bisa dikirim klien. Di deployment yang proxy-nya tidak menimpanya (Vercel menambahkan `x-vercel-forwarded-for`; Caddy harus di-set `trusted_proxies`), penyerang tinggal mengirim XFF acak tiap request → rate limit, login lockout, dan audit-log IP-hash semuanya tidak berguna.
- **Dampak #2 (multi-instance):** tanpa `REDIS_URL`, `rate-limit-store` jatuh ke `Map` in-memory. Di Vercel/serverless atau `docker-compose` dengan >1 replika, limitnya jadi "per instance" → efektif tidak ada.
- **Fix:** pakai header tepercaya dari platform (mis. `x-vercel-forwarded-for` / IP dari Caddy) + tolak XFF dari klien; **wajibkan** `REDIS_URL` di produksi (fail-fast bila `NODE_ENV=production` dan multi-instance).

### P0-5. SEO: situs streaming tanpa halaman anime yang bisa diindeks (gap terbesar)
- **Tidak ada route `/anime/[slug]` maupun `/watch/[slug]`.** Semua halaman anime adalah modal client-side yang dibuka lewat query param (`/?anime=slug`).
- **Sitemap justru mencantumkan URL yang tidak akan pernah diindeks** (`src/app/sitemap.ts`):
  - `sections = ['', '#list', '#schedule', '#collections']` → fragment diabaikan Google, jadi 4 entry × 3 locale = 12 URL yang semuanya duplikat dari `/` dan `/en`, `/ja`.
  - baris 37: `url: \`${SITE_URL}${locale}/?anime=${a.slug}\`` → canonical halaman ini adalah `/` (di-set di root layout), jadi Google akan membuang semuanya.
  - baris 32: `take: 100` → katalog dibatasi 100 anime, sisanya tidak pernah masuk sitemap.
- **Dampak:** nol halaman yang bisa ranking untuk kata kunci "nonton {judul} sub indo" — padahal itulah mesin pertumbuhan utama situs seperti ini. Rich snippet (`AggregateRating`) yang sudah diusahakan di JSON-LD juga tidak akan tampil karena JSON-LD hanya disuntik via JS di modal.
- **Fix:** buat `src/app/anime/[slug]/page.tsx` (server component: fetch anime + episode + review, `generateMetadata` dengan canonical/OG per anime, render JSON-LD **server-side**), jadikan modal sebagai enhancement. Lalu sitemap menunjuk ke route itu, hapus fragment & `take: 100` (pakai cursor/pagination).

### P0-6. Sentry praktis tidak aktif di client
- `src/sentry.client.config.ts` dan `src/sentry.server.config.ts` **tidak pernah di-import siapa pun** (tidak ada `withSentryConfig()` di `next.config.ts`, tidak ada `instrumentation-client.ts`, tidak ada referensi lain).
- `src/instrumentation.ts` hanya meng-init Sentry **server** saat DSN ada.
- **Dampak:** error di browser tidak pernah terkirim; monitoring yang dikonfigurasi di `.env.example` menyesatkan (terlihat aktif padahal tidak).
- **Fix (SDK v10):** tambahkan `instrumentation-client.ts` untuk client, dan/atau bungkus `next.config.ts` dengan `withSentryConfig(...)` (sekaligus upload source map). Hapus file config lama yang tidak terpakai agar tidak menimbulkan ilusi.

### P0-7. Halaman `/ja` palsu & `<html lang>` salah untuk semua locale
- i18n hanya punya locale `id` dan `en` (`src/lib/i18n.ts` → `type Locale = 'id' | 'en'`), tapi ada rute `/ja` dengan metadata Jepang. Isinya 100% komponen yang sama dan UI default Bahasa Indonesia (komentar di `src/app/ja/page.tsx` bahkan hasil copy-paste "English homepage").
- `src/app/layout.tsx:127` → `<html lang="id" …>` untuk **semua** rute, termasuk `/en` dan `/ja`.
- **Dampak:** sinyal bahasa ke Google tidak konsisten (meta `ja_JP` + konten Indonesia + `lang="id"`) → berisiko dianggap duplikat/klanking; aksesibilitas (screen reader) salah bahasa.
- **Fix:** pilih satu — (a) implementasi locale `ja` sungguhan (dictionary + `lang` per rute), atau (b) hapus `/ja` dan redirect ke `/`. Minimal: set `lang` dinamis per segmen layout.
- **Resolusi (PR ini): opsi (b).** `/ja` dihapus dan diarahkan permanen (308) ke `/`; `ja-JP` dibuang dari hreflang + sitemap. `lang` sekarang di-set proxy per-request (`x-locale` → `<html lang>`) dan bahasa yang dirender ditentukan URL, sehingga `/en` benar-benar Inggris sejak HTML pertama. Bonus: toggle bahasa kini berpindah URL di `/` dan `/en` (bukan lagi state klien yang membuat URL dan isi halaman bertentangan). Kalau penerjemahan `ja` sungguhan (termasuk judul/sinopsis) nanti dikerjakan, langkah mengaktifkannya kembali ada di `src/lib/i18n.ts` (`ROUTE_LOCALES`) dan `next.config.ts` (hapus `redirects`).

### P0-8. Domain hardcoded 27× dan env server dipakai di client
- `const SITE_URL = 'https://anichin.id'` disalin di 16+ file (layout, sitemap, robots, structured-data, semua layout auth, API jsonld/og, dsb).
- `src/components/site/anime-detail-modal.tsx:67` (client component) memakai `process.env.NEXTAUTH_URL` — variabel ini **tidak tersedia di browser** (bukan `NEXT_PUBLIC_*`), jadi selalu jatuh ke fallback `https://anichin.id`.
- **Dampak:** deploy di domain/staging lain → canonical, OG image, `og:url`, sitemap, dan link email semuanya menunjuk ke domain yang salah.
- **Fix:** satu sumber kebenaran `src/lib/site.ts` + `NEXT_PUBLIC_SITE_URL` (tambahkan ke `.env.example`), hapus semua literal.

---

## P1 — Penting (bug, biaya, dan kualitas)

### P1-1. GET komentar/ulasan tanpa batas + mismatch validasi vs penyimpanan
- `src/app/api/comments/route.ts` GET & `src/app/api/reviews/route.ts` GET: `findMany` **tanpa `take`/pagination** → satu anime populer bisa mengembalikan ribuan baris tiap request.
- Validasi panjang vs penyimpanan tidak konsisten:
  - komentar: ditolak jika `>1000` (`:94`) tapi **disimpan `slice(0, 300)`** (`:101`)
  - ulasan: ditolak jika `>2000` (`:98`) tapi **disimpan `slice(0, 500)`** (`:105`)
  → user mengirim komentar yang lolos validasi tapi isinya terpotong diam-diam. `slice()` juga bisa memotong surrogate pair (emoji jadi rusak).
- **Fix:** samakan batas (mis. validasi = simpan = 500/1000), gunakan `Intl.Segmenter`/cek surrogate, tambah `take` + cursor pagination, dan validasi dengan skema Zod (paketnya sudah terpasang tapi tidak dipakai sama sekali).

### P1-2. Endpoint pendukung tanpa rate limit / validasi slug
- `src/app/api/anime/[slug]/jsonld/route.ts` & `.../og/route.ts`: **tanpa `checkRateLimit`**, tanpa validasi format slug (route `[slug]` sibling sudah punya pola `safeSlug` — tidak dikonsistenkan).
- `anime-detail-modal.tsx` memanggil `jsonld` **dan** `og` setiap kali modal dibuka hanya untuk menyuntik `<script>`/`<meta>` via JS.
- **Dampak:** dua request + query DB tambahan per buka modal; JSON-LD yang disuntik setelah hydration tidak dijamin dibaca crawler; OG tag yang disuntik JS juga diabaikan scraper sosial (Facebook/WhatsApp tidak menjalankan JS).
- **Fix:** hapus injeksi client-side, render JSON-LD & metadata dari server (lihat P0-5), tambah rate limit di kedua route.

### P1-3. JSON-LD inline tidak diberi nonce (CSP produksi `'strict-dynamic'`)
- `src/app/layout.tsx:132,207` dan `src/components/site/structured-data.tsx:195-203` memakai `dangerouslySetInnerHTML` **tanpa nonce**, sementara CSP produksi (`src/proxy.ts`) hanya mengizinkan script ber-nonce.
- **Dampak:** di beberapa browser, `<script type="application/ld+json">` juga tunduk pada `script-src` → structured data hilang di produksi (sementara di dev terlihat normal).
- **Fix:** ambil nonce di server (`headers().get('x-nonce')`) dan set `nonce={...}`, atau pastikan Next menyuntikkannya; uji di mode produksi (`curl -sI` + cek console untuk pelanggaran CSP).

### P1-4. Beban request homepage berlebihan
- `src/app/layout.tsx` men-`force-dynamic` **semua** halaman, dan homepage memuat ~20 komponen client dengan total **25+ `useQuery`** (`genre-grid` 4, `sidebar`/`trailers`/`anime-browse`/… masing-masing 2-3) → puluhan request API + query DB per kunjungan, tanpa cache CDN/ISR.
- **Fix:** render data penting sebagai RSC (server component) dan kirim sebagai initial data ke TanStack Query, gabungkan endpoint sejenis (mis. `/api/home`), atau pakai `unstable_cache`/revalidate untuk data yang jarang berubah. Pastikan nonce tetap bekerja (nonce butuh HTML dinamis — data boleh tetap di-cache).
- **Resolusi (PR ini):**
  - `src/lib/data/home.ts` — semua query homepage (`listAnime`, `getLatestEpisodes`, `getTodayEpisodes`, `getFeatured`, `getCollections`, `getGenres`, `getPopular`, `getSchedule`, `getStats`) dipindah ke satu modul **server-only** yang dibungkus `unstable_cache` (TTL 120 dtk untuk feed episode, 300 dtk untuk katalog). Route API (`/api/latest`, `/api/anime`, `/api/genres`, …) kini memanggil loader yang sama → satu implementasi, bentuk respons identik dengan sebelumnya (tanggal diserialisasi ISO, `limit` tetap dibatasi 48).
  - `src/lib/queries/home.ts` — kunci & parameter query terpusat (`homeQueryKeys`, `HOME_QUERY_PARAMS`, `animeListUrl`) supaya prefetch server dan `useQuery` di client tidak mungkin berbeda kunci.
  - `src/lib/home-prefetch.ts` + `src/components/home/home-content.tsx` — beranda (dipakai `/` dan `/en`) menjadi RSC: 17 dataset diambil paralel lewat cache, enam di antaranya (breaking news, episode hari ini, rilisan terbaru, ranking populer, jadwal, statistik) dikirim sebagai props `initialData` sehingga ikut ter-render di HTML; sisanya di-dehydrate lewat `<HydrationBoundary>`.
  - Hasil: data homepage tidak lagi diambil lewat HTTP dari browser saat first load, dan tiap dataset hanya di-query sekali per TTL (bukan per kunjungan). Statistik dashboard (`/api/analytics`, admin-only) kini dirender hanya untuk admin — pengunjung biasa berhenti mengirim request yang selalu 401.
  - Ketahanan: `Promise.allSettled` + payload kosong per dataset; kegagalan satu loader (mis. DB down) dicatat ke logger tanpa menjatuhkan seluruh halaman.
  - **Catatan `force-dynamic`:** root layout tetap `force-dynamic` karena nonce CSP harus dibuat per-request (halaman statis tidak bisa membawa nonce → script diblokir `strict-dynamic`). Yang dipindahkan ke cache adalah **datanya**; HTML tetap dinamis tapi murah karena query-nya tidak diulang.

### P1-5. Image optimizer terbuka untuk semua domain
```ts
// next.config.ts:39
remotePatterns: [{ protocol: 'https', hostname: '**' }],
```
- Siapa pun bisa memakai `/_next/image?url=https://situs-lain/…` sebagai proxy/optimizer gratis (abuse biaya CPU + potensi vektor pemindaian jaringan).
- **Fix:** whitelist host asli: `s4.anilist.co`, `cdn.myanimelist.net`, `image.tmdb.org`, CDN streaming sendiri, dst.
- **Resolusi (PR ini):** whitelist dipusatkan di `src/lib/image-hosts.ts` dan dipakai `next.config.ts`:
  - default: `s4.anilist.co`, `cdn.myanimelist.net`, `image.tmdb.org`;
  - tambahan tanpa ubah kode: `NEXT_PUBLIC_IMAGE_HOSTS="cdn.saya.id, bunnycdn.com, *.bunnycdn.com"` (dibaca saat build, juga di browser);
  - wildcard mengikuti semantik Next: `*.bunnycdn.com` **hanya** subdomain, apex perlu entri terpisah (perilaku ini diverifikasi lewat `/_next/image`, lalu helper klien disamakan supaya tidak ada gambar yang "dianggap boleh" tapi ditolak optimizer);
  - `AnimeImage`, hero slider, dan tab karakter/staff menandai `unoptimized` untuk host di luar daftar → poster dari CDN lain tetap tampil (langsung dari sumbernya), optimizer kita tidak dipakai sebagai proxy;
  - `/anime/*.svg` tetap `unoptimized` seperti sebelumnya (SVG memang tidak boleh lewat optimizer).
- **Yang masih dibutuhkan dari pemilik situs:** daftar CDN/CDN streaming final (mis. domain CDN sendiri) untuk dimasukkan ke `NEXT_PUBLIC_IMAGE_HOSTS` di environment produksi; tanpa itu gambar dari CDN tersebut tampil tanpa konversi WebP/AVIF.

### P1-6. 16 dependensi tidak dipakai + README tidak akurat
Dependency tanpa satu pun import di `src/`:
`zod`, `react-hook-form`, `cmdk`, `vaul`, `date-fns`, `react-markdown`, `input-otp`, `embla-carousel-react`, `react-day-picker`, `react-resizable-panels`, `uuid`, `z-ai-web-dev-sdk`, `@radix-ui/react-separator`, `@radix-ui/react-toast`, `@radix-ui/react-toggle`, `@radix-ui/react-tooltip`.
- README mengklaim **"Animation: Framer Motion 12"** — paketnya bahkan tidak ada di `package.json`; dan **"Validation: Zod 4"** padahal Zod nol pemakaian.
- **Fix:** hapus yang tidak dipakai (install lebih cepat, supply-chain surface kecil), lalu pakai Zod untuk validasi route (lihat P1-1) sehingga klaim README jadi benar — atau perbaiki README.

### P1-7. Audit log: blocking I/O + hash IP tanpa salt
- `src/lib/audit-log.ts:100` → `fs.appendFileSync` dipanggil di jalur request → memblokir event loop tiap event (rate-limit hit, error API, dsb).
- `:66` → SHA-256 IP tanpa salt: ruang IPv4 hanya 2³², jadi hash bisa di-brute-force < 1 jam di GPU. Klaim "privacy-safe" di komentar tidak akurat.
- Rotasi berbasis `statSync`+`renameSync` juga tidak aman untuk konkurensi multi-proses.
- **Fix:** `fs.promises.appendFile` dengan antrean/queue (atau stdout JSON → dikumpulkan log collector), dan `createHmac('sha256', IP_HASH_SALT)`.

### P1-8. Index database kurang untuk query terpanas
- `Anime.updatedAt` dipakai `orderBy: { updatedAt: 'desc' }` di `/api/anime` (sort "latest") dan sitemap — **tidak ada index** (yang ada `createdAt`).
- `ServerReview` di-query `WHERE animeSlug ORDER BY createdAt DESC` — hanya ada index `(animeSlug)`.
- `ServerComment` di-query `WHERE animeSlug AND episodeNumber ORDER BY createdAt DESC` — ada `(animeSlug, episodeNumber)` tapi bukan composite dengan `createdAt`.
- **Fix:** satu migrasi Prisma berisi 3 index tambahan (`@@index([updatedAt])`, `@@index([animeSlug, createdAt])`, `@@index([animeSlug, episodeNumber, createdAt])`).

### P1-9. Prisma: config deprecated & file .env tidak dibaca
- `package.json#prisma` masih ada padahal `prisma.config.ts` sudah dibuat → peringatan deprecation tiap `generate`/`migrate` (dan konfigurasi ini akan hilang di Prisma 7).
- `prisma.config.ts` tidak memuat `.env` (komentarnya mengakui ini), sehingga `prisma migrate deploy` (mis. di container `migrate`) bergantung pada env yang di-export manual.
- **Fix:** hapus blok `prisma` dari `package.json`, tambahkan `import 'dotenv/config'` di `prisma.config.ts`, atau set `envFile` bila memakai API baru.

### P1-10. `/admin` bisa diindeks
- `src/app/admin/page.tsx` tidak punya `metadata.robots`, tidak ada `src/app/admin/layout.tsx`, dan `robots.ts` hanya melarang `/api/`.
- Proteksi akses sudah benar (proxy + `requireAdmin`), tapi URL admin tetap masuk hasil pencarian.
- **Fix:** `src/app/admin/layout.tsx` dengan `robots: { index: false, follow: false }`, dan tambahkan `/admin`, `/auth` ke `disallow` di `robots.ts`.

### P1-11. Testing minim di jalur kritikal
- 10 file test unit; tidak ada test integrasi route API (auth, 2FA, comments/reviews, admin) maupun E2E. Tidak ada threshold coverage di CI.
- Sementara `src/lib/auth.test.ts` bergantung pada Prisma client yang ter-generate → suite di-skip diam-diam di lingkungan tanpa DB client (persis yang terjadi di sandbox ini: 1 file gagal dimuat, 118 test tetap "hijau").
- **Fix:** test integrasi Vitest untuk route (mock `@/lib/db`), Playwright smoke (home → buka modal → login → komentar), dan `coverage.thresholds` di `vitest.config.ts`.

### P1-12. Detail kecil yang menabrak build/deploy
- `next.config.ts` meng-import `@next/bundle-analyzer` (devDependency) di top-level → `npm ci --omit=dev` gagal memuat config. Pakai `await import()` kondisional.
- `scripts/build.js` memanggil `bunx prisma generate` tanpa fallback → `npm run build` gagal di lingkungan tanpa Bun (padahal README mendukung Node 20+).
- `Dockerfile` runner masih membuat `/app/db` untuk "SQLite fallback" padahal schema PostgreSQL-only → sisa kode mati, membingungkan.
- **Resolusi (PR ini):**
  - `next.config.ts` sekarang mengekspor **fungsi async** (didukung Next 16: hasilnya di-`await` sebelum dinormalisasi) dan `@next/bundle-analyzer` di-`await import()` hanya saat `ANALYZE=true`. Kalau paketnya tidak ada (mis. `npm ci --omit=dev`), build tetap jalan dengan peringatan.
  - Dua jebakan yang ditemukan saat verifikasi: (a) import dinamis dengan **string literal** tetap menabrak `TS2307` di tahap type-check `next build` — spesifiernya harus lewat variabel; (b) helper klien untuk whitelist gambar tetap dipakai, jadi `remotePatterns` tidak berubah.
  - `scripts/build.js` memakai `scripts/lib/resolve-cli.js` (dengan unit test): binary lokal `node_modules/.bin/{prisma,next}` lebih dulu (npm/bun/pnpm), lalu `bunx`, lalu `npx --yes`. Argumen tambahan diteruskan ke `next build` (mis. `node scripts/build.js --webpack`).
  - `Dockerfile` runner tidak lagi membuat `/app/db`; `/app/logs` tetap ada karena dipakai `src/lib/audit-log.ts` (dan di-mount `docker-compose.prod.yml`).
  - Catatan: `ANALYZE=true` tetap butuh devDependencies terpasang — memang begitu seharusnya, karena analisis bundle hanya untuk developer/CI.

---

## P2 — Nice to have (kebersihan & operasional)

- **Service worker:** `CACHE_VERSION = 'anichin-v1'` manual — lupa bump = user tertahan aset lama. Generate hash saat build (`next.config`/`build.js`) dan sisipkan ke `sw.js`.
  - **Resolusi (PR ini):** `public/sw.js` dihapus; skrip SW tinggal di `src/lib/service-worker.ts` dan dilayani route handler `src/app/sw.js/route.ts` dengan `CACHE_VERSION = 'anichin-<build id>'`. Build id = `NEXT_PUBLIC_BUILD_ID` (env CI/Vercel) → fallback commit SHA → fallback timestamp, di-set sekali di `next.config.ts` supaya ikut ter-inline saat build. Tanggapan dilayani `force-static` + `Cache-Control: no-store` (update SW selalu terdeteksi), dan `Service-Worker-Allowed: /`.
- **Form komentar modal hanya tersimpan di localStorage** — komentar tidak pernah terlihat pengguna lain, dan tombol "Hapus" hanya menghapus salinan lokal (komentar orang lain tetap tampil).
  - **Resolusi (PR ini):** `src/components/site/episode-comments.tsx` membaca daftar dari `GET /api/comments` (cursor pagination, tombol "Muat komentar lama"), mengirim lewat `POST /api/comments`, dan menghapus lewat route baru `DELETE /api/comments/[id]` (hanya penulis atau admin; 403 untuk yang lain). Form dinonaktifkan + tautan login kalau belum masuk (komentar butuh akun, sama seperti ulasan). Store lokal hanya menyimpan jejak aktivitas untuk pencapaian, bukan lagi sumber daftar. Tombol "Suka" dihapus karena `likes` tidak punya endpoint/buku besar per pengguna — menampilkannya hanya akan menyesatkan (follow-up).
  - Sekaligus memperbaiki: modal player/komentar kini juga dipasang di halaman kanonik `/anime/[slug]` — sebelumnya hanya ada di beranda, sehingga tombol "Tonton Sekarang" di halaman anime tidak pernah membuka apa pun.
  - Test: 8 test komponen + 8 test route DELETE.
  - **P2 lanjutan (audit ulang alur ini):** daftar komentar tadinya masih di-cache CDN (`s-maxage=60`) sehingga komentar baru bisa tertahan ~1 menit; paginasi memakai `orderBy` tunggal (`createdAt`) sehingga baris bisa terlewat/ganda antar halaman; cursor yang sudah dihapus berakhir `500`; dan label "Suka" selalu tampil walau tidak bisa diklik. Semua sudah diperbaiki (lihat tabel di atas) + 7 test baru.
- **`public/ai.txt` & `llms.txt`** mengklaim fitur "download anime"; pastikan sinkron dengan produk (dan `ai.txt` mendaftar `/api/admin/` yang tidak pernah di-crawl AI — tidak berbahaya, hanya noise).
  - **Resolusi (P2 lanjutan):** klaim download **diverifikasi akurat** (tab Download + `download480/720/1080` ada di produk & seed), jadi tidak dihapus. Yang diperbarui: rute kanonik `/anime/<slug>` didaftarkan di kedua berkas, `/api/admin/` dibuang dari `ai.txt`.
- **`sanitizeComment` ganda:** logika pembersihan ditulis ulang di `api/comments` & `api/reviews` (dan util di `lib/security.ts` dipakai client). Satukan agar tidak ada dua definisi yang bisa berbeda.
- **Repo hygiene:** tidak ada `.github/dependabot.yml`, `SECURITY.md`, template PR/issue, `CODEOWNERS`. Untuk proyek dengan banyak secret & deploy pipeline, Dependabot + SECURITY.md murah dan berguna.
  - **Resolusi (PR ini):** `.github/dependabot.yml` ditambahkan — **ekosistem `bun`** (bukan `npm`, karena repo ini hanya punya `bun.lock`; ekosistem npm tidak bisa memperbarui lockfile Bun sehingga CI `--frozen-lockfile` akan gagal), plus `github-actions` + `docker` (base image), grup minor/patch, dan ignore major `node` di image runner. `SECURITY.md` ditulis (lingkup, kanal pelaporan, target respons, safe harbor). Catatan: Dependabot hanya membaca konfigurasi dari branch **default** → aktif setelah merge; security update otomatis untuk ekosistem `bun` belum didukung GitHub, jadi advisory produksi tetap dijaga `bun audit --production` di CI. Template PR/issue & CODEOWNERS sudah ditambahkan; **private vulnerability reporting** repo masih `disabled` (diverifikasi lewat API, token tanpa izin admin) sehingga kanal utama `SECURITY.md` belum bisa dipakai — sudah dicatat di dokumen + arahan untuk maintainer.
- **`.env.example`:** belum mendokumentasikan `NEXT_PUBLIC_SITE_URL`, `IP_HASH_SALT`, `DEPLOY_TARGET` untuk Vercel, dsb.
- **`Caddyfile`/compose:** pastikan `trusted_proxies` di-set agar XFF tidak bisa dipalsukan (lihat P0-4).
- **A11y:** setelah `lang` per-locale diperbaiki, pertimbangkan audit `axe` di CI (beberapa dialog Radix perlu `aria-describedby` eksplisit).
- **Test:** E2E/Playwright belum ada (hanya 10 file unit).
  - **Resolusi (PR ini):** `playwright.config.ts` + `e2e/smoke.spec.ts` (23 test, jalan di build produksi) + `e2e/comments.spec.ts` (alur komentar lintas pengguna, `E2E_WITH_DB=1`) dan job CI `🎭 E2E (Playwright)` dengan PostgreSQL ter-seed. Threshold coverage Vitest kini diisi (`@vitest/coverage-v8`, thresholds 58/52/50/60 di `vitest.config.ts`) dan job `test` memakai `bun run test:coverage` sehingga artefak `coverage/` benar-benar berisi.

---

## Rencana aksi yang disarankan

| Prioritas | Item | Estimasi |
| --- | --- | --- |
| Sprint 1 | P0-1 (bump nodemailer/prisma), P0-2 (hapus overrides), P0-3 (health), P0-4 (IP + Redis), P0-8 (`lib/site.ts` + env) | 1-2 hari |
| Sprint 2 | P0-5 (route `/anime/[slug]` + sitemap benar), P0-6 (Sentry client), P0-7 (locale/`lang`) | 3-5 hari |
| Sprint 3 | P1-1…P1-5, P1-8 (Zod + pagination + index + CSP nonce + endpoint) | 3-4 hari |
| Sprint 4 | P1-6, P1-7, P1-9…P1-11 + P2 | 2-3 hari |

**Quick wins (< 1 jam, berdampak langsung):** P0-3, P0-2, P1-5, P1-9, P1-10, dan hapus dependensi tak terpakai (P1-6).

## Cara verifikasi ulang

```bash
cp .env.example .env            # isi DATABASE_URL, NEXTAUTH_SECRET
bun install
bunx prisma generate
bun run lint && bunx tsc --noEmit
bun run test              # atau: bun run test:coverage (menegakkan threshold)
bun run build                   # atau: DEPLOY_TARGET=standalone bun run build
npm audit --omit=dev
docker compose -f docker-compose.prod.yml config   # validasi env compose
```
