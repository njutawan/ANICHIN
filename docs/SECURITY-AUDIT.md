# AniChin — Audit Keamanan (19 Poin)

**Tanggal:** 2026-10-14
**Skop:** seluruh repo `njutawan/ANICHIN` (Next.js 16 App Router + NextAuth v4 + Prisma/PostgreSQL + Docker/Caddy + GitHub Actions)
**Commit dasar:** `eb52573` (branch `arena/c4ede340-anichin`)
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
| 11 | Server-side auth | ✅ | Semua route sensitif memakai `requireUser`/`requireAdmin` (bukan cek di klien); NextAuth JWT diverifikasi di server. **F-03 (oracle TOTP) diperbaiki.** |
| 12 | Cek akses user | ✅ | IDOR diuji: DELETE komentar/ulasan hanya pemilik atau admin (403); data user lain tidak pernah dikembalikan (select minimal, tanpa `password`). |
| 13 | Role admin aman | ✅ | `/admin` dijaga proxy (JWT role) + `requireAdmin` di setiap route `/api/admin/*` (5/5 file) + noindex; admin tidak bisa menurunkan dirinya sendiri; promosi/demosi tercatat di log. **F-05, F-06, F-07 dicatat.** |
| 14 | DB jangan public | ✅ | Compose mengikat `127.0.0.1:5432` / `127.0.0.1:6379` / `127.0.0.1:3000`; hanya Caddy yang publik; `POSTGRES_PASSWORD` wajib (`:?`); volume terpisah; WAL archiving (yang dulu bisa memenuhi disk) sengaja dihapus. |
| 15 | DB permission ketat | ⚠️ | Kredensial kuat & port lokal sudah benar, tetapi aplikasi memakai role **pemilik DB** (bisa DDL). Lihat **F-16** (least privilege). |
| 16 | Hash password | ✅ | bcrypt cost 10 di register, reset, dan user OAuth (password acak 32 byte). **F-08 (kunci 2FA salah format) diperbaiki.** |
| 17 | Session aman | ⚠️ | Cookie `httpOnly` + `SameSite=Lax` + `Secure` (prod), JWT 7 hari / sesi 30 hari, secret produksi wajib (tanpa fallback). Lihat **F-09** (prefix cookie) & **F-06** (revokasi sesi). |
| 18 | Reset password aman | ✅ | Token 32 byte CSPRNG, sekali pakai, kedaluwarsa 1 jam, semua token lain dibatalkan dalam transaksi, pesan generik anti-enumeration. **F-02 & template email diperbaiki.** |
| 19 | Batasi file upload | ➖ | **Tidak ada fitur upload** (tidak ada `formData()`/multipart/tulis file dari request). Yang ada hanya URL gambar eksternal dari admin (lihat F-14) dan optimizer `next/image` yang host-nya sudah di-allowlist. |

**Hasil perintah verifikasi**

```
npm audit --omit=dev   → 0 vulnerabilities (311 dependensi produksi)
npx vitest run         → 309 test lulus (36 dari 37 file); 1 suite butuh `prisma generate`
                         (sandbox ini tidak bisa mengunduh engine Prisma; di CI normal)
npx tsc --noEmit       → bersih
npx eslint <file yang diubah> → bersih
```

**Perubahan kode pada audit ini:** 4 temuan Tinggi/Sedang diperbaiki + 1 temuan dokumentasi/konfigurasi, ditambah **14 test regresi** baru.

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

#### F-06 — [Sedang] Reset password / perubahan role tidak mencabut sesi yang sudah aktif

**Bukti:** strategi sesi adalah JWT stateless (`src/lib/auth.ts`); `jwt` callback hanya menyegarkan role dari DB ketika `trigger === 'update'`; tidak ada `sessionVersion`/`passwordChangedAt`. `reset-password` hanya mengubah `password`.
**Dampak:** cookie sesi yang sudah dicuri (atau akun yang di-demote/dihapus) tetap berlaku sampai JWT kedaluwarsa — hingga **7 hari**. Korban yang mereset password karena akunnya diambil alih tidak memutus akses penyerang.
**Rekomendasi (belum diubah):** tambahkan kolom `sessionVersion Int @default(0)` (atau `passwordChangedAt`) pada `User`, sertakan di klaim JWT saat login, dan tolak token yang versinya lebih tua pada `jwt`/`session` callback; naikkan `sessionVersion` di reset-password, ganti password, dan saat admin menurunkan role/menghapus user.

#### F-07 — [Sedang] `allowDangerousEmailAccountLinking: true` pada Google & GitHub

**Bukti:** `src/lib/auth.ts` (dua provider OAuth memakai flag ini), sementara `signIn` callback membuat/menautkan akun hanya berdasarkan `email` tanpa memeriksa `emailVerified` akun lokal.
**Dampak:** flag ini secara eksplisit "dangerous" di NextAuth: akun OAuth dengan email sama otomatis ditautkan ke akun lokal. Jika provider mengembalikan email yang belum terverifikasi (atau klaim email bisa diatur), akun bisa dibajak tanpa password. Risiko bergantung pada provider; Google/GitHub pada umumnya memverifikasi email, tetapi ini melepas satu lapis pertahanan tanpa perlu.
**Rekomendasi:** hapus flag ini (biarkan NextAuth menolak tautan otomatis), atau set hanya untuk provider yang benar-benar memverifikasi email dan tambahkan syarat `user.emailVerified` pada akun lokal.

#### F-08 — [Sedang] `TWO_FACTOR_ENCRYPTION_KEY` di-generate dengan format yang ditolak aplikasi

**Bukti:** `scripts/setup-github-secrets.sh` (`openssl rand -base64 32` → 44 char), `scripts/setup-oauth.sh`, `docs/DEPLOYMENT.md`, `docs/VERCEL-DEPLOY.md`, `docs/PRODUCTION-OAUTH.md` — sedangkan validator `src/lib/two-factor.ts` mensyaratkan **64 hex char** (`/^[0-9a-fA-F]{64}$/`) dan melempar error untuk format lain.
**Dampak:** siapa pun yang mengikuti skrip/dokumentasi ini mendapat konfigurasi yang **lolos deploy** tetapi membuat `POST /api/auth/2fa/enable` selalu gagal 500 — 2FA (kontrol keamanan utama akun) tidak bisa diaktifkan, dan errornya baru muncul saat pengguna mencoba. Kegagalan ini fail-closed, tapi membuat fitur keamanan mati diam-diam.
**Perbaikan:** semua tempat diganti menjadi `openssl rand -hex 32` (konsisten dengan `.env.example`), placeholder contoh di dokumentasi diganti nilai hex yang valid, dan `deploy.yml` kini memperingatkan bila secret yang dikirim bukan 64 hex.

### Dilaporkan (belum diubah — butuh keputusan/uji lanjutan)

| ID | Sev | Temuan | Bukti | Rekomendasi |
|---|:--:|---|---|---|
| **F-09** | Sedang–Rendah | Cookie sesi tidak memakai prefix `__Secure-`/`__Host-`. Karena `cookies` dikonfigurasi manual (`src/lib/auth.ts`), NextAuth kehilangan prefix otomatisnya | `src/lib/auth.ts` (`name: 'next-auth.session-token'`), default NextAuth memakai `__Secure-`/`__Host-` | Ganti nama cookie ke `__Host-next-auth.session-token` **dan** panggil `getToken({ …, secureCookie: true })` di `src/proxy.ts`; uji akses `/admin` setelah perubahan (sesi lama akan logout) |
| **F-10** | Rendah | *Backup code* 2FA ditampilkan sekali tetapi **tidak disimpan** (skema belum punya kolom) → tidak bisa dipakai login; pengguna yang kehilangan authenticator tidak punya jalur pemulihan | `src/lib/two-factor.ts` (`generateBackupCodes`), `src/app/api/auth/2fa/verify/route.ts`, `SECURITY.md` (klaim lama) | Tambah kolom hash backup code + konsumsi sekali pakai; `SECURITY.md` sudah dikoreksi pada audit ini |
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
- **2FA:** TOTP `otplib` (±1 langkah), secret terenkripsi AES-256-GCM (`iv:authTag:ciphertext`), `/enable` mewajibkan pending secret + kode valid, `/disable` mewajibkan password, dekripsi gagal → fail closed.
- **DB & infra:** port DB/Redis/web hanya `127.0.0.1`; `POSTGRES_PASSWORD` wajib; container app berjalan sebagai `nextjs` (uid 1001, non-root); HEALTHCHECK; log container dibatasi (`max-size`/`max-file`); backup harian 02:00 retensi 14 hari.
- **XSS/SQLi:** tidak ada `innerHTML`/`eval`; JSON-LD selalu lewat `sanitizeForJSONLD` + nonce; CSP nonce tanpa `unsafe-inline`/`unsafe-eval` di produksi; Prisma parameterized; input pencarian dibersihkan + pola injeksi dicatat ke audit log.

---

## 4. Rekomendasi lanjutan (urut prioritas)

1. **Revokasi sesi (F-06)** — satu-satunya temuan yang masih membiarkan akses penyerang bertahan setelah korban mengganti password.
2. Hapus `allowDangerousEmailAccountLinking` (F-07) atau kunci ke `emailVerified` lokal.
3. Prefix cookie `__Host-` + `secureCookie` di proxy (F-09) — sertakan uji manual `/admin` sesudahnya.
4. Simpan *backup code* 2FA (F-10) supaya pengguna punya jalur pemulihan.
5. Least privilege DB (F-16) dan pisahkan role migrasi.
6. Validasi URL media admin (F-14) dengan `sanitizeUrl()`.
7. Verifikasi host key SSH di pipeline (F-15).
8. Persist pending secret 2FA ke Redis (F-11) bila di-deploy multi-instance.
9. Turunkan informasi pada `/api/health` (F-13) dan pertimbangkan anti-enumeration di register (F-12).

## 5. Cara verifikasi ulang

```bash
npm ci && npx prisma generate          # CI resmi
npm audit --omit=dev                   # wajib 0 vulnerability (dipakai CI)
npx tsc --noEmit && npx eslint .
npx vitest run                         # 309+ test, termasuk 14 regresi audit ini
# uji manual cepat (dev):
#   1. Tanpa SMTP + NODE_ENV=production → POST /api/auth/send-verification
#      tidak boleh memuat devUrl, dan log tidak memuat ?token=
#   2. POST /api/auth/2fa/verify {email, token} → jawabannya hanya
#      { requiresTwoFactor }; tidak ada verifikasi kode
#   3. curl -s https://<domain>/api/health | jq  → error DB hanya DB_UNAVAILABLE
```

> Catatan lingkungan: pada sandbox audit ini `prisma generate` tidak dapat mengunduh engine (hanya `registry.npmjs.org` yang diizinkan), sehingga suite `src/lib/auth.test.ts` tidak dapat dijalankan; seluruh 36 suite lain (309 test) lulus.
