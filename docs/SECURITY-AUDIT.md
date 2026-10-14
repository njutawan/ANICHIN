# AniChin — Audit Keamanan (19 Poin)

**Tanggal:** 2026-10-14
**Skop:** seluruh repo `njutawan/ANICHIN` (Next.js 16 App Router + NextAuth v4 + Prisma/PostgreSQL + Docker/Caddy + GitHub Actions)
**Commit dasar:** `eb52573` (branch `arena/c4ede340-anichin`)
**Terakhir diperbarui:** 2026-10-15 — F-07 & F-19 (`src/lib/auth.ts`, `src/app/auth/login/page.tsx`), F-10 (`src/lib/two-factor*.ts`, migrasi `20261015140000`)
**Metode:** pembacaan kode baris-per-baris pada jalur auth/data/DB/deploy, pemindaian seluruh objek Git (344 blob, semua branch), `npm audit`, dan menjalankan test suite.

---

## 1. Ringkasan

| # | Area yang diminta | Verdict | Catatan singkat |
|:--:|---|:--:|---|
| 1 | API key aman | ✅ | Semua kredensial hanya dari env; tidak ada key hardcoded; injeksi lewat stdin (bukan argv) & file `.env` `umask 077` + `chmod 600`. |
| 2 | File `.env` jangan public | ✅ | `.gitignore` (`.env*`, `!.env.example`) & `.dockerignore` mengecualikan `.env*`; `.env` tidak pernah masuk image. |
| 3 | No hardcode secret | ✅ | Pemindaian pola (AWS/GitHub/Google/private key/DSN) hanya menemukan placeholder di `.env.example`, docs, dan CI (`ci-test-secret…`). |
| 4 | Cek secret di git | ✅ | Seluruh riwayat (344 blob, semua branch) dipindai: hanya password dev/CI lokal (`anichin:anichin@localhost`) dan contoh di dokumentasi. Tidak ada rahasia produksi. |
| 5 | Debug mode OFF | ✅ | `productionBrowserSourceMaps:false`, `poweredByHeader:false`, `X-Powered-By` dihapus di proxy, logger ber-`LOG_LEVEL` (default `info` di prod), Sentry hanya aktif di prod/`SENTRY_DEBUG`. |
| 6 | Error jangan bocor | ✅ | Semua route membalas pesan generik; `err.message` hanya masuk `logger` server-side; `/api/health` mengembalikan `DB_UNAVAILABLE` (bukan pesan Prisma); `error.tsx`/`global-error.tsx` menyembunyikan `message` di produksi. **F-02 (token di log) diperbaiki.** |
| 7 | Validasi input | ✅ | Zod terpusat (`src/lib/validation.ts`), body-size guard 4–8 KB, whitelist enum (`type/status/season`), rentang angka, slug regex, paginasi `limit` dibatasi. |
| 8 | Sanitasi input | ✅ | `sanitizeUserText` (strip tag stabil + buang kontrol/zero-width + truncate per code point) dipakai komentar & ulasan; nama tampilan `sanitizeDisplayName`; `sanitizeForJSONLD` untuk JSON-LD. **F-14 (URL admin) rekomendasi.** |
| 9 | Anti SQL injection | ✅ | Prisma parameterized di semua query; satu-satunya raw SQL adalah `SELECT 1` (health) & `SELECT 1` (migrasi) — tanpa input pengguna. Tidak ada `$queryRawUnsafe`. |
| 10 | Anti XSS | ✅ | Tidak ada `innerHTML`/`eval`/`new Function` di produksi; `dangerouslySetInnerHTML` hanya untuk JSON-LD yang di-escape + nonce; CSP nonce (`'strict-dynamic'`) di produksi. **F-04 (domain skrip asing) diperbaiki.** |
| 11 | Server-side auth | ✅ | Semua route sensitif memakai `requireUser`/`requireAdmin` (bukan cek di klien); NextAuth JWT diverifikasi di server. **F-03 (oracle TOTP) & F-19 (bypass 2FA lewat OAuth) diperbaiki.** |
| 12 | Cek akses user | ✅ | IDOR diuji: DELETE komentar/ulasan hanya pemilik atau admin (403); data user lain tidak pernah dikembalikan (select minimal, tanpa `password`). |
| 13 | Role admin aman | ✅ | `/admin` dijaga proxy (JWT role) + guard server-side di `admin/layout.tsx` + `requireAdmin` di setiap route `/api/admin/*` (5/5 file) + noindex; admin tidak bisa menurunkan dirinya sendiri; promosi/demosi mencabut sesi lama & tercatat di log. **F-18 & F-07 diperbaiki** — penautan akun OAuth hanya jalan bila provider memverifikasi emailnya, jadi akun admin tidak bisa diambil alih lewat email OAuth. |
| 14 | DB jangan public | ✅ | Compose mengikat `127.0.0.1:5432` / `127.0.0.1:6379` / `127.0.0.1:3000`; hanya Caddy yang publik; `POSTGRES_PASSWORD` wajib (`:?`); volume terpisah; WAL archiving (yang dulu bisa memenuhi disk) sengaja dihapus. |
| 15 | DB permission ketat | ⚠️ | Kredensial kuat & port lokal sudah benar, tetapi aplikasi memakai role **pemilik DB** (bisa DDL). Lihat **F-16** (least privilege). |
| 16 | Hash password | ✅ | bcrypt cost 10 di register, reset, dan user OAuth (password acak 32 byte). **F-08 (kunci 2FA salah format) diperbaiki.** |
| 17 | Session aman | ✅ | Cookie `httpOnly` + `SameSite=Lax` + `Secure` + prefix `__Secure-`/`__Host-` (prod), JWT 7 hari / sesi 30 hari, secret produksi wajib (tanpa fallback), **pencabutan sesi** lewat `User.sessionVersion` (F-06) + nama cookie terpusat (F-09/F-18), dan **kode cadangan 2FA** tersimpan sebagai hash + sekali pakai (F-10) sebagai jalur pemulihan. |
| 18 | Reset password aman | ✅ | Token 32 byte CSPRNG, sekali pakai, kedaluwarsa 1 jam, semua token lain dibatalkan dalam transaksi, pesan generik anti-enumeration, dan **semua sesi lama dicabut** (`sessionVersion`) saat password diganti. **F-02 & template email diperbaiki.** |
| 19 | Batasi file upload | ➖ | **Tidak ada fitur upload** (tidak ada `formData()`/multipart/tulis file dari request). Yang ada hanya URL gambar eksternal dari admin (lihat F-14) dan optimizer `next/image` yang host-nya sudah di-allowlist. |

**Hasil perintah verifikasi**

```
npm audit --omit=dev   → 0 vulnerabilities (311 dependensi produksi)
npx vitest run         → 396 test lulus (43 dari 44 file); 1 suite butuh `prisma generate`
                         (sandbox ini tidak bisa mengunduh engine Prisma; di CI normal)
npx tsc --noEmit       → bersih
npx eslint .           → bersih
```

**Perubahan kode pada audit ini:** **12 temuan diperbaiki** (F-01…F-10, F-18, F-19), **7 masih terbuka** (F-11…F-17), ditambah **101 test regresi** baru (14 pada audit awal, 27 pada lanjutan F-06/F-18, 22 pada lanjutan F-07/F-19, 38 pada lanjutan F-10).

---

## 2. Temuan

### Sudah diperbaiki pada audit ini

#### F-01 — [Tinggi] Token verifikasi email dibalas ke klien di produksi (tanpa SMTP)

**Bukti:** `src/lib/email.ts` — jalur "SMTP tidak dikonfigurasi" mengembalikan
`{ delivered: true, provider: 'console', devUrl: verificationUrl }` **tanpa** memeriksa `NODE_ENV`, dan `src/app/api/auth/send-verification/route.ts` meneruskan `devUrl` itu ke respons.
**Dampak:** siapa pun yang mendaftar memakai alamat email orang lain menerima token verifikasi lewat response API, lalu bisa menandai alamat itu sebagai *verified* tanpa akses ke inbox. Kontrol "email terverifikasi" jadi tidak bermakna (dan identitas email korban bisa diklaim).
**Perbaikan:** `deliverEmail()` kini mengembalikan `delivered:false` + tanpa `devUrl` di produksi; route tetap menyaring `devUrl` sebagai lapis kedua.
**Regression test:** `src/lib/email-security.test.ts`, `src/app/api/auth/send-verification/route.test.ts`.

#### F-02 — [Tinggi] Token reset password ditulis ke log produksi

**Bukti:** `src/app/api/auth/forgot-password/route.ts` — saat SMTP belum dikonfigurasi, baris `logger.info('[forgot-password] Reset URL (no SMTP)', { resetUrl })` berjalan tanpa guard `NODE_ENV`.
**Dampak:** di produksi tanpa SMTP, URL reset (berisi token sekali pakai, berlaku 1 jam) masuk ke stdout/Docker log. Siapa pun yang bisa membaca log (operator, agregator log, atau penyerang yang membaca log) bisa mereset password **akun mana pun** yang meminta reset → pengambilalihan akun penuh (CWE-532).
**Perbaikan:** URL hanya di-log di non-produksi; di produksi yang tercatat hanya peringatan "SMTP belum dikonfigurasi" tanpa token. Sekaligus: email reset kini memakai template **Reset Password** (`sendPasswordResetEmail`) — sebelumnya memakai template "Verifikasi Email Kamu".
**Regression test:** `src/app/api/auth/forgot-password/route.test.ts`.

#### F-03 — [Tinggi] Endpoint 2FA memvalidasi kode TOTP tanpa autentikasi (melewati lockout)

**Bukti:** `src/app/api/auth/2fa/verify/route.ts` (versi lama) menerima `{ email, token }` dari siapa pun tanpa login, mendekripsi `twoFactorSecret`, dan menjawab `{ valid: true|false }`.
**Dampak:** penyerang yang sudah punya password korban bisa mencari kode TOTP yang sedang valid lewat endpoint ini **di luar** lockout login (5 percobaan/15 menit), lalu memakai kode itu sekali di `signIn` → 2FA terlewati. Rate limit 20 req/menit per IP tidak menutup serangan terdistribusi. Endpoint ini juga menjadi oracle enumerasi status 2FA.
**Perbaikan:** endpoint sekarang hanya membaca flag `twoFactorEnabled` (`{ email }` → `{ requiresTwoFactor }`); kolom `twoFactorSecret` tidak lagi disentuh, dan verifikasi TOTP **hanya** terjadi di `src/lib/auth.ts` `authorize()` yang sudah memeriksa `isAccountLocked()` dan mencatat kegagalan (`recordFailedAttempt`). Halaman login disesuaikan (tidak lagi mengirim `token`).
**Regression test:** `src/app/api/auth/2fa/verify/route.test.ts` — memastikan `verifyTwoFactorToken`/`decryptSecret` **tidak pernah** dipanggil dari endpoint publik.

#### F-04 — [Sedang] CSP mengizinkan skrip dari domain asing (`chunk-server.com`)

**Bukti:** `src/proxy.ts` — `TRUSTED_SCRIPT_DOMAINS = ['https://chunk-server.com']`; domain ini tidak direferensikan oleh satu pun file/package di repo.
**Dampak:** `script-src` menunjuk domain pihak ketiga yang tidak dipakai aplikasi. Pada browser/proxy yang mengabaikan `'strict-dynamic'`, siapa pun yang menguasai domain itu bisa memuat skrip ke halaman (XSS/supply-chain). Domain yang berpindah kepemilikan juga menjadi jalur suplai.
**Perbaikan:** allowlist dikosongkan (array kosong) dengan komentar agar penambahan berikutnya harus beralasan.

#### F-05 — [Sedang] Default rahasia yang bisa ditebak di `docker-compose.staging.yml`

**Bukti:** `POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-staging-password-change-me}` dan `NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-staging-secret-not-for-production-32-chars}`.
**Dampak:** jika staging dijalankan tanpa env, JWT/sesi ditandatangani dengan secret yang **tertulis di repo publik** → siapa pun bisa menempa token sesi (termasuk `role: admin`) dan masuk ke panel admin staging (yang sering memakai data produksi).
**Perbaikan:** keempat variabel (`POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, dan `DATABASE_URL` turunannya) memakai `${VAR:?…}` sehingga compose **gagal cepat** alih-alih memakai default. Pipeline staging sudah mengirim nilai dari GitHub Secrets, jadi tidak ada perubahan alur deploy.

#### Perbaikan lanjutan (setelah audit awal)

#### F-06 — [Tinggi] Reset password / perubahan role tidak mencabut sesi yang sudah aktif ✅ DIPERBAIKI

**Bukti:** strategi sesi adalah JWT stateless (`src/lib/auth.ts`); `jwt` callback hanya menyegarkan role dari DB ketika `trigger === 'update'`; tidak ada `sessionVersion`/`passwordChangedAt`. `reset-password` hanya mengubah `password`.
**Dampak:** cookie sesi yang sudah dicuri (atau akun yang di-demote/dihapus) tetap berlaku sampai JWT kedaluwarsa — hingga **7 hari**. Korban yang mereset password karena akunnya diambil alih tidak memutus akses penyerang.
**Perbaikan (implementasi):**
1. Kolom `User.sessionVersion Int @default(0)` + migrasi `prisma/migrations/20261015120000_add_session_version/` (lihat `docs/MIGRATIONS.md` — migrasi wajib jalan sebelum kode baru melayani request).
2. `jwt` callback (`src/lib/auth.ts`): saat login, identitas (`id`/`role`/`name`) dan `sessionVersion` diambil **dari DB** (bukan dari objek provider — ini sekaligus memperbaiki login OAuth yang `id`-nya id akun Google/GitHub, bukan id baris `User`). Pada request berikutnya token divalidasi ulang ke DB: `sessionVersion` berbeda → klaim `id`/`role` dibersihkan; baris `User` hilang → idem. Validasi dibatasi `SESSION_REVALIDATE_SECONDS` (default 60 detik; `0` = setiap request).
3. `session` callback: sesi yang sudah dicabut mengembalikan payload kosong → SDK klien (`fetchData`) membacanya sebagai `null`, jadi `useSession`/`useAuth` langsung menganggap pengguna logout.
4. `sessionVersion` dinaikkan pada peristiwa yang mengubah jaminan identitas: **reset password** (`/api/auth/reset-password`), **perubahan role oleh admin** (`PATCH /api/admin/users`), dan **penonaktifan 2FA** (`/api/auth/2fa/disable` — faktor kedua hilang, semua sesi dicabut; halaman 2FA otomatis sign-out).
5. Guard server-side (`src/lib/session.ts`) kini menempuh jalur session NextAuth (yang menjalankan `jwt` callback → cek DB), dan **fail closed**: sesi tanpa `id`/`role` = belum login. Decode JWT saja sengaja tidak dipakai — salinan cookie yang dicuri tidak pernah di-refresh, jadi tanpa cek DB pencabutan tidak akan berpengaruh.
6. `/admin` dapat guard tambahan di `src/app/admin/layout.tsx` (`isAdmin()` → redirect) sehingga halaman admin juga tunduk pada pencabutan, bukan hanya API-nya.
**Fail-open yang disengaja:** bila DB error saat validasi ulang, token dipertahankan (kalau tidak, gangguan DB sesaat = logout massal permanen karena cookie ditulis ulang tanpa klaim) dan jadwal validasi tidak dimajukan sehingga request berikutnya mencoba lagi.
**Catatan:** token lama (diterbitkan sebelum fitur ini) tidak punya klaim `sv` → nilainya diadopsi dari DB pada validasi pertama (trust on first use), jadi tidak ada logout massal. Namun karena nama cookie ikut berubah ke `__Secure-…` (F-09/F-18), semua sesi lama memang logout satu kali saat deploy.
**Regression test:** `src/lib/session-revocation.test.ts` (12), `src/lib/session.test.ts` (11), `src/lib/auth-cookies.test.ts` (4).

#### F-08 — [Sedang] `TWO_FACTOR_ENCRYPTION_KEY` di-generate dengan format yang ditolak aplikasi

**Bukti:** `scripts/setup-github-secrets.sh` (`openssl rand -base64 32` → 44 char), `scripts/setup-oauth.sh`, `docs/DEPLOYMENT.md`, `docs/VERCEL-DEPLOY.md`, `docs/PRODUCTION-OAUTH.md` — sedangkan validator `src/lib/two-factor.ts` mensyaratkan **64 hex char** (`/^[0-9a-fA-F]{64}$/`) dan melempar error untuk format lain.
**Dampak:** siapa pun yang mengikuti skrip/dokumentasi ini mendapat konfigurasi yang **lolos deploy** tetapi membuat `POST /api/auth/2fa/enable` selalu gagal 500 — 2FA (kontrol keamanan utama akun) tidak bisa diaktifkan, dan errornya baru muncul saat pengguna mencoba. Kegagalan ini fail-closed, tapi membuat fitur keamanan mati diam-diam.
**Perbaikan:** semua tempat diganti menjadi `openssl rand -hex 32` (konsisten dengan `.env.example`), placeholder contoh di dokumentasi diganti nilai hex yang valid, dan `deploy.yml` kini memperingatkan bila secret yang dikirim bukan 64 hex.

#### F-18 — [Tinggi] Nama cookie sesi tidak cocok → `/admin` selalu dianggap belum login di produksi ✅ DIPERBAIKI

**Bukti:** `src/lib/auth.ts` menulis cookie bernama `next-auth.session-token` (tanpa prefix) walaupun `useSecureCookies: true`, karena `authOptions.cookies` menimpa default NextAuth. Sementara `getToken()` di `src/proxy.ts` (dan `next-auth/jwt`) menghitung sendiri nama yang dicarinya: `secureCookie ? '__Secure-next-auth.session-token' : …`, dengan `secureCookie` default = `NEXTAUTH_URL.startsWith('https://')` → **di produksi selalu `__Secure-…`**.
**Dampak:** di produksi `getToken()` selalu `null` → middleware menganggap semua orang belum login → setiap akses `/admin` dialihkan ke login dengan `error=AccessDenied` walau sudah login sebagai admin: **panel admin tidak bisa dipakai dari UI**. (API `/api/admin/*` tetap jalan karena memakai jalur sesi NextAuth yang membaca `authOptions`.) Cacat ini juga membuat jenis pemeriksaan middleware apa pun (termasuk pencabutan sesi di Edge) tidak dapat dipercaya.
**Perbaikan:** nama cookie dipusatkan di `src/lib/auth-cookies.ts` (prefix `__Secure-` untuk session/callback/pkce, `__Host-` untuk CSRF — sesuai default NextAuth, sekaligus menutup F-09), dipakai oleh `authOptions.cookies`, `src/proxy.ts` (dengan `cookieName` + `secureCookie` eksplisit) dan guard server-side. Karena nama cookie berubah, semua sesi lama logout satu kali saat deploy.
**Regression test:** `src/lib/auth-cookies.test.ts` mengunci nama di produksi vs non-produksi **dan** memastikan `authOptions.cookies` identik dengan yang dipakai `getToken()`.

#### F-09 — [Sedang–Rendah] Cookie sesi tanpa prefix `__Secure-`/`__Host-` ✅ DIPERBAIKI (bagian dari F-18)

Prefix hilang karena `cookies` dikonfigurasi manual di `authOptions`. Sekarang `SESSION_COOKIE_NAME`/`CSRF_COOKIE_NAME` memakai prefix yang benar di produksi (`Secure` + `Path=/` terpenuhi sehingga `__Host-` valid). Uji manual yang disarankan: setelah deploy, pastikan cookie `__Secure-next-auth.session-token` ter-set dan `/admin` bisa dibuka oleh admin, lalu pastikan user biasa tetap ditolak.

#### F-07 — [Sedang] Penautan akun OAuth ke akun lokal hanya berdasar kesamaan email ✅ DIPERBAIKI

**Koreksi premis audit awal:** temuan asli berbunyi "`allowDangerousEmailAccountLinking: true` membuat akun OAuth dengan email sama otomatis ditautkan". Setelah kode NextAuth dibaca, flag itu **tidak pernah dieksekusi**: penanganan flag berada di cabang *adapter* (`node_modules/next-auth/core/lib/callback-handler.js` — `if (!adapter) return { user: profile, account }`), sedangkan aplikasi ini tidak memasang adapter. Jadi flag itu memang layak dihapus (menghindari bahaya kalau kelak adapter ditambahkan), tetapi **bukan** ia yang menautkan akun.
**Sumber bahaya yang sebenarnya:** callback `signIn` milik aplikasi sendiri di `src/lib/auth.ts` — ia mencari `User` berdasarkan email profil lalu mengizinkan login. Pemeriksaan email yang jadi sandaran juga lemah: `providers/github.js` mengambil email primary dari `GET /user/emails` dengan `emails.find(e => e.primary) ?? emails[0]` **tanpa memeriksa `verified`**, dan `providers/google.js` tidak meneruskan `email_verified`.
**Dampak:** siapa pun yang bisa mengendalikan klaim email di provider (email belum terverifikasi, atau email primary palsu bila provider mengizinkannya) bisa masuk sebagai pemilik akun lokal dengan email tersebut — termasuk akun admin — tanpa mengetahui passwordnya, dan tanpa 2FA (lihat F-19).
**Perbaikan:**
1. Kedua flag `allowDangerousEmailAccountLinking: true` dihapus (Google & GitHub), dengan komentar tegas agar tidak dipasang kembali bila adapter ditambahkan.
2. Callback `signIn` hanya menangani `account.type === 'oauth'`; jalur kredensial tidak berubah.
3. **Email wajib terbukti terverifikasi di provider**: Google → klaim `email_verified`; GitHub → cek langsung `GET /user/emails` memakai `access_token` sesi OAuth itu dan mensyaratkan entri yang cocok **dan** `verified: true`. Provider asing, token hilang, respons non-2xx, atau error jaringan → **ditolak (fail closed)**.
4. Email dinormalisasi (`trim().toLowerCase()`) sekali di awal, sehingga lookup `User` tidak bisa berbeda dari yang di-`create`.
5. Bila akun lokal belum terverifikasi, email ditandai `emailVerified` — kepemilikan email sudah dibuktikan provider, jadi ini setara dengan klik tautan verifikasi.
6. Error DB lain (bukan `P2002` balapan) → tolak login; sebelumnya `return true` di `catch` sehingga kegagalan DB pun tetap membuat sesi.
**Perilaku yang disengaja:** pemilik sah yang akunnya dibuat via OAuth tetap bisa login seperti biasa; akun lokal lama dengan email terverifikasi akan tetap cocok (emailnya diverifikasi provider yang sama atau tidak — bila verifikasi gagal mereka diminta login dengan password, bukan dikunci).
**Regression test:** `src/lib/oauth-linking.test.ts` (22) — termasuk email Google belum terverifikasi, klaim hilang, email GitHub `verified:false`, API error/timeout, tanpa access token, dan provider asing.

#### F-19 — [Tinggi] OAuth melewati 2FA akun lokal ✅ DIPERBAIKI (ditemukan saat F-07)

**Bukti:** alur OAuth hanya melewati callback `signIn` → `jwt`; form kode TOTP (`signIn('credentials', …)` → `authorize()`) tidak pernah dijalankan. Sebelum perbaikan, callback `signIn` untuk akun yang sudah ada hanya berkomentar "Allow sign-in anyway" dan mengembalikan `true` tanpa memeriksa `twoFactorEnabled`.
**Dampak:** penyerang yang menguasai/membuat identitas OAuth dengan email korban (lihat F-07) langsung mendapat sesi korban **tanpa** kode TOTP — kontrol 2FA (dan F-06 pencabutan sesi yang bergantung pada login) dilewati sepenuhnya. Akun ber-role tinggi paling menarik di sini.
**Perbaikan:** callback `signIn` membaca `twoFactorEnabled` akun lokal; bila aktif, login OAuth **ditolak** dengan redirect `?error=UsePasswordLogin` dan pengguna diarahkan memakai email + password + kode autentikator. `jwt` callback tetap memuat identitas dari DB (F-06), jadi tidak ada jalur OAuth yang bisa membentuk sesi tanpa melewati pemeriksaan ini.
**Catatan:** pengguna yang mengaktifkan 2FA memang kehilangan tombol OAuth — ini konsekuensi yang diterima: satu-satunya alternatif aman adalah meminta kode TOTP setelah OAuth, yang berarti menambah langkah kustom di luar alur NextAuth.
**Regression test:** `src/lib/oauth-linking.test.ts` — kasus "akun lokal memakai 2FA → ditolak" untuk Google dan GitHub.

#### F-10 — [Rendah] Kode cadangan 2FA ditampilkan sekali tetapi tidak pernah disimpan ✅ DIPERBAIKI

**Bukti:** `generateBackupCodes()` menghasilkan 8 kode, `/api/auth/2fa/enable` mengirimkannya ke klien, lalu kode itu tidak pernah ditulis ke database — skema `User` tidak punya kolomnya. `authorize()` hanya memverifikasi TOTP, dan `SECURITY.md` bahkan mencantumkan bahwa kode cadangan **tidak bisa** dipakai login.
**Dampak:** janji "simpan kode cadangan" di UI tidak punya arti. Pengguna yang kehilangan authenticator (HP hilang/rusak, app ter-reset) **terkunci permanen** dari akunnya sendiri — termasuk akun admin — karena 2FA (dan F-19) mewajibkan faktor kedua saat login. Ini juga satu-satunya jalur pemulihan mandiri: reset password tidak membantu karena 2FA tetap diminta setelahnya.
**Perbaikan:**
1. **Model baru `TwoFactorBackupCode`** (migrasi `20261015140000_add_2fa_backup_codes`): `userId`, `codeHash`, `usedAt`, `createdAt`, index `(userId, usedAt)`, `onDelete: Cascade`. Tabel terpisah dipakai (bukan satu kolom `String[]`) supaya tiap kode punya status "terpakai" masing-masing — syarat untuk semantik sekali pakai yang atomik.
2. **Hanya hash bcrypt yang disimpan** (`hashBackupCodes`, cost 10). Kode plaintext hanya hidup selama respons pembuatan. Entropi tiap kode dinaikkan dari 4 byte (32 bit) ke **5 byte (40 bit)**, format `XXXXX-XXXXX`; input dinormalkan (`normalizeBackupCode`) sehingga huruf kecil / tanpa dash tetap diterima.
3. **Sekali pakai yang benar-benar atomik:** `consumeBackupCode()` mencari kode yang cocok, lalu mengklaim dengan `updateMany({ where: { id, usedAt: null }, data: { usedAt: now } })` dan hanya lanjut bila `count === 1`. Dua login bersamaan dengan kode yang sama → hanya satu yang lolos.
4. **Login menerima TOTP atau kode cadangan** di kolom yang sama (`authorize()`): TOTP diverifikasi lebih dulu, kode cadangan hanya dicoba bila bentuknya kode cadangan. Semuanya tetap di dalam alur yang diperiksa `isAccountLocked()` dan mencatat `recordFailedAttempt`, jadi brute-force kode ikut dibatasi 5 percobaan/15 menit per email+IP. Akun `twoFactorEnabled` tanpa secret sekarang juga wajib faktor kedua (sebelumnya dilewatkan).
5. **Pemulihan kode:** endpoint baru `POST /api/auth/2fa/backup-codes` (wajib login **dan** password) membuat 8 kode baru dan menghapus semua kode lama dalam satu transaksi; `/api/auth/2fa/status` mengembalikan `backupCodesRemaining`; halaman `/auth/2fa` menampilkan sisa kode, memperingatkan saat 0, dan menyediakan form regenerate. `disable` menghapus semua kode.
6. Halaman login menerima masukan `XXXXX-XXXXX` pada langkah 2FA dan memberi tahu bahwa kode cadangan bisa dipakai sebagai pengganti authenticator.
**Catatan:** kode cadangan sengaja tidak kedaluwarsa (sama seperti GitHub/Google) — selama belum dipakai ia tetap berlaku; regenerate kapan saja membatalkan semuanya. Regenerate tidak mencabut sesi (`sessionVersion`) karena kode cadangan tidak menjaga sesi berjalan.
**Regression test:** `src/lib/two-factor-backup.test.ts` (10), `src/lib/auth-2fa-login.test.ts` (11 — TOTP tetap bisa login, kode cadangan sekali pakai, huruf kecil/tanpa dash, error DB fail closed, akun terkunci), `src/app/api/auth/2fa/backup-codes/route.test.ts` (9), tambahan `src/lib/two-factor.test.ts` (8).

### Dilaporkan (belum diubah — butuh keputusan/uji lanjutan)

| ID | Sev | Temuan | Bukti | Rekomendasi |
|---|:--:|---|---|---|
| **F-11** | Rendah | Pending secret 2FA disimpan di `Map` in-memory (TTL 5 menit) | `src/lib/two-factor.ts` | Multi-instance tanpa sticky session: pindahkan ke Redis (pola `rate-limit-store.ts`) |
| **F-12** | Rendah | `POST /api/auth/register` membocorkan keberadaan email (`409 "Email sudah terdaftar."`), padahal `forgot-password` sengaja anti-enumeration | `src/app/api/auth/register/route.ts` | Bila ingin tertutup: balas 201/200 + kirim email "email sudah terdaftar" (butuh SMTP) |
| **F-13** | Rendah | `/api/health` publik mengembalikan `version`, `environment`, `uptime`, dan RSS (di field `latencyMs`) | `src/app/api/health/route.ts` | Hapus `version`/`environment` (atau batasi ke jaringan internal); gunakan `rssMb` alih-alih menaruh byte di `latencyMs` |
| **F-14** | Rendah | URL `poster`/`banner`/`trailer` dari `POST/PUT /api/admin/anime` disimpan tanpa validasi skema (hanya `.trim()`/potong 1000 char). Rendered sebagai `<img>`/`<video>` sehingga `javascript:` tidak tereksekusi, tapi nilainya tetap masuk metadata/JSON-LD & `next/image` | `src/app/api/admin/anime/route.ts`, `src/app/api/admin/anime/[id]/route.ts` | Validasi dengan `sanitizeUrl()`/allowlist host + tolak skema selain `http(s)` |
| **F-15** | Rendah | Pipeline deploy memakai `ssh-keyscan … \|\| true` + `ssh -o StrictHostKeyChecking=no` → host key tidak diverifikasi | `.github/workflows/deploy.yml` (4 langkah SSH) | Simpan host key sebagai secret (`DEPLOY_HOST_KEY`) dan tulis ke `known_hosts`, lalu `StrictHostKeyChecking=yes`; aktifkan juga *required reviewers* untuk environment produksi |
| **F-16** | Info | Aplikasi terhubung ke PostgreSQL memakai role **pemilik** DB (`anichin`) → bisa DDL/DROP; migration memakai kredensial yang sama | `docker-compose.prod.yml` | Buat role aplikasi terbatas (DML saja) + role migrasi terpisah dengan kredensial berbeda |
| **F-17** | Info | bcrypt memotong password pada 72 byte, sedangkan register menerima 128 karakter (dan reset 1024) | `src/app/api/auth/register/route.ts`, `src/lib/auth.ts` | Batasi maksimum 72 byte, atau pre-hash (SHA-256 → base64) sebelum bcrypt; pastikan konsisten di register & reset |

---

## 3. Yang sudah benar (bukti ringkas)

- **Rahasia & env:** `.gitignore` (`.env*`, `!.env.example`, `.env.admin`, `/logs/`, `/pgdata/`), `.dockerignore` mengecualikan `.env*`; `scripts/deploy-env.sh` menulis `.env` dari stdin dengan `umask 077` + `chmod 600` dan tidak pernah mencetak nilai; `setup-github-secrets.sh` menyimpan backup di `$HOME` (di luar repo) dengan `chmod 600`; CI memakai `permissions: contents: read` dan action dipin ke SHA.
- **Autentikasi:** NextAuth v4 kredensial + OAuth opsional; `resolveSecret()` melempar error di produksi bila `NEXTAUTH_SECRET` hilang/<16 char; lockout 5 gagal/15 menit (Redis/in-memory) dengan kunci `email+IP`; `getClientIp()` hanya mempercayai header edge atau entri XFF dari kanan sejumlah `TRUSTED_PROXY_HOPS`; Caddy menimpa `X-Forwarded-For` dengan IP soket → spoofing header tidak bisa melewati rate limit/lockout.
- **Otorisasi:** `src/lib/session.ts` (`requireUser`/`requireAdmin`) dipakai di semua route yang butuh; 5/5 file `src/app/api/admin/**` memanggil `requireAdmin`; proxy memblokir `/admin*` untuk non-admin pada Edge (JWT), `/admin` juga `noindex`; admin tidak bisa menurunkan role sendiri.
- **Rate limit & audit:** tier `auth` 20 / `search` 30 / `read` 60 / `expensive` 10 per menit per IP, respons 429 + `Retry-After` + header `X-RateLimit-*`; audit log `logs/audit.jsonl` (rotasi 10 MB, dilewati di serverless) dengan IP di-HMAC-SHA256 memakai `IP_HASH_SALT`.
- **2FA:** TOTP `otplib` (±1 langkah), secret terenkripsi AES-256-GCM (`iv:authTag:ciphertext`), `/enable` mewajibkan pending secret + kode valid, `/disable` mewajibkan password, dekripsi gagal → fail closed; akun ber-2FA tidak bisa masuk lewat OAuth (F-19); **kode cadangan sekali pakai** disimpan sebagai hash bcrypt di `TwoFactorBackupCode` (F-10) dan bisa dipakai login sebagai pengganti TOTP, tetap di dalam lockout login.
- **Penautan akun OAuth (setelah F-07/F-19):** tanpa adapter NextAuth (flag *dangerous* dihapus & dikomentari), callback `signIn` sendiri yang mengatur: hanya `account.type === 'oauth'`, email wajib terverifikasi provider (Google `email_verified`, GitHub `/user/emails` dengan `verified:true`, fail closed untuk provider asing/error), akun ber-2FA ditolak, dan kegagalan DB → tolak (kecuali `P2002` balapan create).
- **Sesi (setelah F-06/F-09/F-18):** cookie `httpOnly` + `SameSite=Lax` + `Secure` + prefix `__Secure-`/`__Host-`; nama cookie terpusat di `src/lib/auth-cookies.ts` sehingga penulis (NextAuth) & pembaca (`getToken`) tidak bisa berbeda lagi; klaim JWT memuat `id`/`role`/`sv`; `User.sessionVersion` divalidasi ulang ke DB (default ≤60 detik, `SESSION_REVALIDATE_SECONDS`) dan dinaikkan saat reset password, perubahan role, dan penonaktifan 2FA; guard server-side (`src/lib/session.ts`) fail closed untuk sesi yang dicabut; `/admin` dijaga 3 lapis (proxy Edge → `admin/layout.tsx` yang DB-validated → `requireAdmin()` di tiap API).
- **DB & infra:** port DB/Redis/web hanya `127.0.0.1`; `POSTGRES_PASSWORD` wajib; container app berjalan sebagai `nextjs` (uid 1001, non-root); HEALTHCHECK; log container dibatasi (`max-size`/`max-file`); backup harian 02:00 retensi 14 hari.
- **XSS/SQLi:** tidak ada `innerHTML`/`eval`; JSON-LD selalu lewat `sanitizeForJSONLD` + nonce; CSP nonce tanpa `unsafe-inline`/`unsafe-eval` di produksi; Prisma parameterized; input pencarian dibersihkan + pola injeksi dicatat ke audit log.

---

## 4. Rekomendasi lanjutan (urut prioritas)

1. Least privilege DB (F-16) dan pisahkan role migrasi.
2. Validasi URL media admin (F-14) dengan `sanitizeUrl()`.
3. Verifikasi host key SSH di pipeline (F-15).
4. Persist pending secret 2FA ke Redis (F-11) bila di-deploy multi-instance.
5. Turunkan informasi pada `/api/health` (F-13) dan pertimbangkan anti-enumeration di register (F-12).
6. Samakan batas panjang password dengan batas bcrypt 72 byte (F-17).
7. Operasional sesi: pertimbangkan `SESSION_REVALIDATE_SECONDS=0` pada situs berisiko tinggi, dan pantau lonjakan query akibat validasi (1 lookup PK per request setelah jendela habis). Bila jumlah request ber-sesi tinggi, tambahkan cache in-process berkunci `id:sv` agar validasi tidak menembak DB setiap request.

> Catatan migrasi: deploy **wajib** menjalankan `prisma migrate deploy` (service `migrate`
> di `docker-compose.prod.yml`, atau `bun run db:migrate:prod`) sebelum versi baru menerima
> traffic — kolom `User.sessionVersion` dibaca di jalur login.

## 5. Cara verifikasi ulang

```bash
npm ci && npx prisma generate          # CI resmi
npm audit --omit=dev                   # wajib 0 vulnerability (dipakai CI)
npx tsc --noEmit && npx eslint .
npx vitest run                         # 396 test, termasuk 101 regresi audit ini
# uji manual cepat (dev):
#   1. Tanpa SMTP + NODE_ENV=production → POST /api/auth/send-verification
#      tidak boleh memuat devUrl, dan log tidak memuat ?token=
#   2. POST /api/auth/2fa/verify {email, token} → jawabannya hanya
#      { requiresTwoFactor }; tidak ada verifikasi kode
#   3. curl -s https://<domain>/api/health | jq  → error DB hanya DB_UNAVAILABLE
#   4. Pencabutan sesi: login (cookie A) → di DB naikkan sessionVersion user
#      (UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1) → request
#      berikutnya dengan cookie A harus 401 & /api/auth/session kosong
#   5. Nama cookie: di produksi harus `__Secure-next-auth.session-token`
#      (bukan tanpa prefix) dan /admin harus bisa dibuka oleh admin
#   6. Penautan OAuth (F-07/F-19): login Google/GitHub dengan email akun lokal
#      yang 2FA-nya aktif → harus ditolak (?error=UsePasswordLogin); akun tanpa
#      2FA dengan email sama boleh masuk; akun dengan email belum terverifikasi
#      di provider → ditolak (?error=OAuthEmailNotVerified)
#   7. Kode cadangan (F-10): aktifkan 2FA → catat kode → login pakai kode itu di
#      kolom kode 2FA (harus berhasil), login lagi dengan kode yang sama (harus
#      gagal); /auth/2fa harus menampilkan sisa kode berkurang; "Buat ulang kode
#      cadangan" (butuh password) harus membatalkan kode lama
```

> Catatan lingkungan: pada sandbox audit ini `prisma generate` tidak dapat mengunduh engine (hanya `registry.npmjs.org` yang diizinkan), sehingga suite `src/lib/auth.test.ts` tidak dapat dijalankan; seluruh suite lain lulus.
