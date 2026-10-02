# AniChin — Nonton Anime Subtitle Indonesia Terlengkap

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8)
![Bun](https://img.shields.io/badge/Bun-runtime-FBF0DF)
![License](https://img.shields.io/badge/License-MIT-green)
![Node](https://img.shields.io/badge/Node-20%2B-339933)

> Tema streaming & unduh anime berbasis Next.js 16 yang mereplikasi pengalaman
> situs anichin.moe. Dibangun dengan TypeScript, Tailwind CSS 4, shadcn/ui,
> Prisma, TanStack Query, Zustand, dan Zod. Aman untuk produksi
> (security-hardened) dan siap di-deploy via Docker.

---

## Daftar Isi

1. [Fitur Unggulan](#fitur-unggulan)
2. [Tech Stack](#tech-stack)
3. [Quick Start](#quick-start)
4. [Struktur Proyek](#struktur-proyek)
5. [Skrip Tersedia](#skrip-tersedia)
6. [Environment Variables](#environment-variables)
7. [Deployment Produksi](#deployment-produksi)
8. [Security Features](#security-features)
9. [SEO Features](#seo-features)
10. [Performance Notes](#performance-notes)
11. [Monitoring & Health Check](#monitoring--health-check)
12. [License](#license)
13. [Acknowledgments](#acknowledgments)

---

## Fitur Unggulan

- 🎬 **Hero slider** dengan 6 featured anime + trending rail.
- 📚 **Browse & filter** berdasarkan genre, tipe (TV/Movie/OVA), status, dan sort (popularitas/skor/tanggal).
- 🔍 **Pencarian real-time** dengan modal command-palette.
- 📅 **Jadwal rilis harian** per hari (Senin–Minggu).
- 🧭 **Halaman detail kanonik** `/anime/[slug]` (server-rendered, JSON-LD + OG per anime, masuk sitemap) — modal cepat tetap tersedia sebagai enhancement.
- 📝 **Detail modal** dengan tab: Episode, Characters, Staff, Relations, Reviews, Comments.
- ▶️ **Watch player** dengan continue-watching progress bar.
- 🔖 **Bookmark system** + koleksi pilihan editor.
- 💬 **Reviews & comments** dengan autentikasi (NextAuth.js Credentials).
- 🛡️ **Security-hardened**: rate limiting 3-tier, CSP, audit logging, cookie hardening, login lockout.
- 🌗 **Dark/Light theme** dengan `next-themes`.
- 📱 **PWA-ready**: manifest, ikon 192/512, apple-touch-icon.
- 🤖 **SEO-ready**: sitemap, robots.txt, JSON-LD structured data.

---

## Tech Stack

| Layer            | Technology                                                            |
| ---------------- | --------------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router, Turbopack, standalone output)                 |
| Language         | TypeScript 5.9                                                        |
| Runtime          | Bun (dev) / Node.js 20+ (production)                                   |
| Database         | PostgreSQL 16 (dev & produksi) via Prisma 6                           |
| ORM              | Prisma 6.19                                                           |
| Styling          | Tailwind CSS 4 + tw-animate-css                                       |
| UI Components    | shadcn/ui (Radix UI primitives)                                       |
| State Management | Zustand 5 (client) + TanStack Query 5 (server state)                  |
| Auth             | NextAuth.js v4 (Credentials provider, JWT strategy)                    |
| Animation        | CSS/Tailwind transitions (tanpa library animasi tambahan)              |
| Image Optimization| Next.js Image + Sharp 0.35                                           |
| Charts           | Recharts 3 (admin dashboard)                                          |
| Validation       | Zod 4 (payload komentar & ulasan) + sanitasi manual di `lib/security` |

---

## Quick Start

### Prasyarat

- **Node.js 20+** atau **Bun 1.1+** (rekomendasi: Bun untuk dev)
- **PostgreSQL 16+** (dev & produksi — schema Prisma hanya mendukung PostgreSQL)
- **Git**

### Instalasi

```bash
# 1. Clone repo
git clone https://github.com/your-org/anichin.git
cd anichin

# 2. Install dependencies (gunakan Bun untuk dev tercepat)
bun install

# 3. Salin environment example dan isi nilainya
cp .env.example .env
#   → Edit .env:
#     - NEXTAUTH_SECRET=$(openssl rand -hex 32)
#     - NEXTAUTH_URL=http://localhost:3000
#     - DATABASE_URL=postgresql://anichin:anichin@localhost:5432/anichin?schema=public

# 3b. Siapkan PostgreSQL 16 (opsi cepat pakai Docker)
docker run -d --name anichin-db -p 5432:5432 \
  -e POSTGRES_USER=anichin -e POSTGRES_PASSWORD=anichin -e POSTGRES_DB=anichin \
  postgres:16-alpine

# 4. Generate Prisma client + push schema ke PostgreSQL
bun run db:generate
bun run db:push

# 5. Seed database (24 anime, 22 genre, 223 episode)
bun run seed

# 6. Jalankan dev server
bun run dev
```

Buka [http://localhost:3000](http://localhost:3000) — server siap dalam ~2 detik (Turbopack).

---

## Struktur Proyek

```
anichin/
├── prisma/
│   ├── schema.prisma           # Skema database (PostgreSQL)
│   └── migrations/             # Prisma Migrate (lihat docs/MIGRATIONS.md)
├── public/
│   ├── anime/                  # 29 poster SVG + 5 banner SVG
│   ├── icon-192.png            # PWA icon (maskable)
│   ├── icon-512.png            # PWA icon (maskable)
│   ├── apple-touch-icon.png
│   ├── logo.svg
│   └── og-image.png
├── scripts/
│   ├── seed.ts                 # Seed 24 anime + 223 episode
│   ├── admin.ts                # CLI: buat/promosikan admin, reset password
│   ├── start-postgres.ts       # Embedded PostgreSQL + migrate + seed (dev)
│   ├── migrate-to-pg.ts        # Migrasi data SQLite → PostgreSQL
│   ├── build.js                # Build universal (Vercel vs standalone)
│   ├── setup-env.sh            # Setup env + prisma generate
│   ├── backup-db.sh            # Backup PostgreSQL (dipakai deploy.yml)
│   ├── restore-db.sh           # Restore dari backup
│   └── verify-oauth.ts         # Verifikasi konfigurasi OAuth
├── src/
│   ├── app/
│   │   ├── api/                # 15 API routes (all rate-limited)
│   │   │   ├── anime/          # List + detail by slug
│   │   │   ├── auth/           # NextAuth + register
│   │   │   ├── featured/
│   │   │   ├── popular/
│   │   │   ├── latest/
│   │   │   ├── search/
│   │   │   ├── schedule/
│   │   │   ├── genres/
│   │   │   ├── today/
│   │   │   ├── collections/
│   │   │   ├── recommendations/
│   │   │   ├── reviews/
│   │   │   ├── comments/
│   │   │   ├── analytics/
│   │   │   ├── random/
│   │   │   ├── stats/
│   │   │   └── route.ts        # Health check (/api)
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── admin/              # Admin dashboard (auth-protected)
│   │   ├── sitemap.ts          # Auto sitemap.xml
│   │   ├── robots.ts           # robots.txt
│   │   ├── manifest.ts         # PWA manifest
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── error.tsx
│   │   ├── global-error.tsx
│   │   ├── loading.tsx
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── site/               # Domain components (header, hero, modal, dll.)
│   │   └── ui/                 # shadcn/ui primitives (40+ components)
│   ├── hooks/
│   │   ├── use-auth.ts         # Auth hook wrapping useSession
│   │   └── use-mounted.ts      # Hydration-safe mounted flag
│   ├── lib/
│   │   ├── auth.ts             # NextAuth config (cookie hardening, lockout)
│   │   ├── session.ts          # requireUser / requireAdmin helpers
│   │   ├── db.ts               # Prisma client singleton
│   │   ├── rate-limit.ts       # Tiered rate limiter (+ optional Redis store)
│   │   ├── audit-log.ts        # File-based JSONL audit logger
│   │   ├── security.ts         # Validation + sanitization helpers
│   │   ├── store.ts            # Zustand stores
│   │   ├── types.ts
│   │   └── utils.ts            # cn() helper
│   └── proxy.ts                # Security headers + CSP nonce (Next 16: pengganti middleware.ts)
├── next.config.ts              # Standalone output + konfigurasi image
├── tailwind.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── Dockerfile                  # Multi-stage (deps → builder → runner)
├── docker-compose.prod.yml          # web + db + optional caddy
├── .env.example                # Template untuk environment variables
└── package.json
```

---

## Migrasi Database

```bash
npx prisma migrate dev --name <nama>   # dev: buat + jalankan migrasi baru
npx prisma migrate deploy              # prod: jalankan migrasi (juga otomatis di docker/CI)
npx prisma migrate status              # cek status migrasi
```

Database yang **sudah terisi** dan dibuat lewat `db push`/manual perlu
di-baseline sekali dengan `npx prisma migrate resolve --applied 20261001000000_init`
(penjelasan lengkap: [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md)).

---

## Skrip Tersedia

| Script                | Perintah                                            | Deskripsi                                              |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `dev`                 | `bun run dev`                                       | Jalankan dev server (Turbopack) di port 3000          |
| `build`               | `bun run build`                                     | Build produksi standalone + copy static & public       |
| `start`               | `bun run start`                                     | Jalankan server produksi (Node/Bun) standalone         |
| `lint`                | `bun run lint`                                      | ESLint check pada seluruh codebase                     |
| `db:push`             | `bun run db:push`                                   | Push schema.prisma ke database (overwrite)             |
| `db:generate`         | `bun run db:generate`                               | Generate Prisma Client (setelah ubah schema)          |
| `db:migrate`          | `bun run db:migrate`                                | Prisma Migrate (dev mode, buat migration baru)         |
| `db:reset`            | `bun run db:reset`                                  | Reset database + jalankan ulang semua migration       |
| `seed`                | `bun run seed`                                      | Seed 24 anime + 22 genre + 223 episode                 |
| `test`                | `bun run test`                                      | Unit test Vitest (9 suite / 111+ test)                 |
| `db:migrate:prod`     | `bun run db:migrate:prod`                           | `prisma generate` + `prisma migrate deploy` (produksi) |
| `db:migrate:status`   | `bun run db:migrate:status`                         | Cek status migration terhadap database                 |
| `healthcheck`         | `bun run healthcheck`                               | Cek `/api/health` di localhost:3000                    |

---

## Environment Variables

Lihat [`.env.example`](./.env.example) untuk dokumentasi lengkap dengan komentar.

| Variable                  | Wajib | Deskripsi                                                            | Contoh                                       |
| ------------------------- | :---: | -------------------------------------------------------------------- | -------------------------------------------- |
| `DATABASE_URL`            |  ✅   | Connection string Prisma (PostgreSQL — dev & prod)                   | `postgresql://anichin:…@localhost:5432/anichin?schema=public` |
| `NEXTAUTH_SECRET`         |  ✅   | Secret untuk JWT & session cookies (min 16 char, 32 hex disarankan) | `openssl rand -hex 32`                       |
| `NEXTAUTH_URL`            |  ✅   | URL kanonik aplikasi tanpa trailing slash                            | `https://anichin.id`                         |
| `NEXT_PUBLIC_SITE_URL`    |  ⬜   | Override URL publik (canonical/OG/sitemap). Dipakai juga di browser   | `https://staging.anichin.id`                 |
| `TRUSTED_PROXY_HOPS`      |  ⬜   | Jumlah reverse proxy tepercaya di depan app (default `1`)            | `2`                                          |
| `IP_HASH_SALT`            |  ⬜   | Salt HMAC untuk hash IP di audit log (disarankan di produksi)        | `openssl rand -hex 32`                       |
| `NODE_ENV`                |  ⬜   | Override environment (`production` / `development`)                 | `production`                                  |
| `NEXT_TELEMETRY_DISABLED` |  ⬜   | Set `1` untuk opt-out Next.js telemetry                              | `1`                                          |
| `PORT`                    |  ⬜   | Port server (default: 3000)                                          | `3000`                                       |
| `POSTGRES_PASSWORD`       |  ⬜   | Password container PostgreSQL (untuk docker-compose)                 | `strong-random-password`                    |
| `SITE_DOMAIN`             |  ⬜   | Domain publik untuk Caddy reverse proxy (auto-HTTPS)                 | `anichin.id`                                 |

---

## Deployment Produksi

### Prasyarat Produksi

- **Node.js 20+** atau **Bun 1.1+**
- **PostgreSQL 16+** (jangan pakai SQLite di produksi)
- **Domain + HTTPS** (Let's Encrypt gratis, auto-managed oleh Caddy)
- **Minimal 1 vCPU / 1 GB RAM** untuk small deployment

### 1. Setup Database PostgreSQL

```bash
# Buat database + user
sudo -u postgres psql -c "CREATE DATABASE anichin;"
sudo -u postgres psql -c "CREATE USER anichin WITH PASSWORD 'strong-password';"
sudo -u postgres psql -c "GRANT ALL ON DATABASE anichin TO anichin;"

# Update .env
# DATABASE_URL="postgresql://anichin:strong-password@localhost:5432/anichin?schema=public"

# Migrasi data dari SQLite (development) → PostgreSQL (production)
bun run migrate:pg
```

### 2. Build & Run (Bare Metal)

```bash
# Set env produksi
export NODE_ENV=production
export NEXTAUTH_URL="https://anichin.id"
export NEXTAUTH_SECRET="$(openssl rand -hex 32)"

# Build standalone output
bun run build

# Jalankan server (Node.js recommended untuk standalone)
node .next/standalone/server.js
# atau: bun run start
```

Server akan listen di `0.0.0.0:3000`. Gunakan reverse proxy (Caddy/Nginx) untuk HTTPS.

### 3. Docker (Rekomendasi)

Cara paling cepat — sudah termasuk PostgreSQL + reverse proxy opsional:

```bash
# Salin env example + isi nilai produksi
cp .env.example .env
# Edit: NEXTAUTH_URL, NEXTAUTH_SECRET, POSTGRES_PASSWORD, DATABASE_URL

# Build + jalankan semua service
docker-compose up -d

# Cek status
docker-compose ps
docker-compose logs -f web

# Stop
docker-compose down

# Reset database (hati-hati!)
docker-compose down -v
```

Aplikasi tersedia di `http://localhost:3000` (atau domain yang dikonfigurasi).

### 4. Reverse Proxy (Caddy / Nginx)

#### Caddy (Auto-HTTPS via Let's Encrypt)

Uncomment service `caddy` di `docker-compose.prod.yml`, lalu set `SITE_DOMAIN` di `.env`:

```env
SITE_DOMAIN="anichin.id"
```

Caddy akan:
- Auto-request sertifikat TLS dari Let's Encrypt
- Redirect HTTP → HTTPS
- Inject header `X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Proto`
- Passthrough ke `web:3000`

Konfigurasi Caddyfile yang disertakan sudah menambahkan 9 security headers sebagai defense-in-depth.

#### Nginx (Manual)

Contoh minimal `nginx.conf`:

```nginx
server {
    listen 80;
    server_name anichin.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name anichin.id;

    ssl_certificate     /etc/letsencrypt/live/anichin.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/anichin.id/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Security Features

Aplikasi sudah melalui multiple security audit rounds. Berikut ringkasan:

### Rate Limiting (4-tier, in-memory)

| Tier         | Limit       | Routes                                                         |
| ------------ | ----------- | -------------------------------------------------------------- |
| `auth`       | 20 / min    | `/api/auth/*` (signin, callback, signout — bukan passive)    |
| `search`     | 30 / min    | `/api/search`                                                  |
| `read`       | 60 / min    | `/api/anime`, `/api/anime/[slug]`, `/api/featured`, dll.      |
| `expensive`  | 10 / min    | `/api/analytics`, `/api/collections`, `/api/random`           |

Response menyertakan header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

### Content Security Policy (CSP)

`src/proxy.ts` (middleware Next 16) menginject CSP header ke semua response:
- Produksi: `script-src 'self' 'nonce-<per-request>' 'strict-dynamic'` — nonce
  diteruskan lewat **request header** `Content-Security-Policy`, yang dibaca
  Next.js untuk memberi `nonce` pada script-nya. Karena nonce hanya bisa
  disuntikkan pada halaman yang dirender per-request, root layout memakai
  `export const dynamic = 'force-dynamic'`.
- Development: `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (Turbopack HMR)
- `frame-src 'self' youtube.com youtube-nocookie.com` (untuk trailer)
- `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`

### HTTP Security Headers (9 layer)

Dikirim oleh middleware + next.config.ts (defense-in-depth):

1. `Strict-Transport-Security` — HSTS 1 tahun + preload
2. `X-Content-Type-Options: nosniff`
3. `X-Frame-Options: DENY` (+ CSP `frame-ancestors`)
4. `Referrer-Policy: strict-origin-when-cross-origin`
5. `Permissions-Policy` — disable 11 browser APIs (camera, mic, payment, dll.)
6. `X-DNS-Prefetch-Control: off`
7. `X-Permitted-Cross-Domain-Policies: none`
8. `Cross-Origin-Opener-Policy: same-origin`
9. `Cross-Origin-Resource-Policy: same-origin`

Plus: `X-Powered-By` header dihapus (anti-fingerprinting).

### Audit Logging

File `src/lib/audit-log.ts` menulis event ke `logs/audit.jsonl`:
- Format JSON Lines (append-only, mudah di-parse)
- Auto-rotation saat file melebihi 10 MB → `audit.old.jsonl`
- IP di-SHA-256 hash (privacy-safe, tidak bisa di-reverse)
- Event: `RATE_LIMIT_EXCEEDED`, `API_ERROR`, `SUSPICIOUS_REQUEST`, `NOT_FOUND`

### Cookie Hardening (NextAuth)

- `httpOnly: true` (anti-XSS cookie theft)
- `sameSite: 'lax'` (balance UX + CSRF)
- `secure: true` di production (HTTPS-only)
- Session: 30 hari rolling, JWT max-age 7 hari

### Login Lockout

- 5x gagal login → lockout 15 menit per email+IP
- Tidak membocorkan status lockout (selalu 401 generic)
- Auto-cleanup entry kedaluwarsa setiap 10 menit

---

## SEO Features

| Feature                          | File                          | Description                                            |
| -------------------------------- | ----------------------------- | ------------------------------------------------------ |
| **Sitemap.xml** (auto)           | `src/app/sitemap.ts`          | Static + dynamic anime pages, revalidate 1 jam        |
| **Robots.txt**                   | `src/app/robots.ts`           | Allow `/`, disallow `/api/`, sitemap reference         |
| **PWA Manifest**                 | `src/app/manifest.ts`         | name, icons (192/512), shortcuts, theme_color          |
| **JSON-LD structured data**      | `src/components/site/structured-data.tsx` | Schema.org VideoObject + BreadcrumbList     |
| **Open Graph + Twitter Card**    | `src/app/layout.tsx`          | og:image, og:title, og:description, twitter:card      |
| **Canonical URLs**               | `src/app/layout.tsx`          | Mencegah duplicate content                             |

---

## Performance Notes

- **Standalone output**: `next.config.ts` set `output: 'standalone'` → bundle minimal (~30 MB) tanpa `node_modules` penuh.
- **Turbopack**: dev server 2× lebih cepat dari Webpack.
- **Image optimization**: AVIF + WebP, `minimumCacheTTL: 3600`, remote patterns via `next/image`.
- **Compression**: gzip/brotli aktif (`compress: true`).
- **Static + dynamic hybrid**: `force-static` untuk sitemap, `force-dynamic` untuk API routes yang butuh data fresh.
- **TanStack Query**: client-side caching 5 menit default + stale-while-revalidate.
- **Prisma connection pooling**: singleton pattern di `src/lib/db.ts` (mencegah connection leak di serverless/long-running).

---

## Monitoring & Health Check

### Health Endpoint

```http
GET /api
```

Response:
```json
{
  "status": "ok",
  "service": "AniChin API"
}
```

Status code `200` → sehat. Gunakan untuk Docker healthcheck, load balancer, atau uptime monitor (UptimeRobot, BetterUptime).

### Log Files

| File                  | Content                                                |
| --------------------- | ------------------------------------------------------ |
| `logs/audit.jsonl`     | Security-relevant events (rate limit, errors, dll.)    |
| `logs/audit.old.jsonl`| Rotated audit log (jika aktif > 10 MB)                 |
| `dev.log`             | Output dev server (created by `bun run dev`)           |
| `server.log`          | Output production server (created by `bun run start`)   |

### Docker Healthcheck

Dockerfile sudah mengonfigurasi `HEALTHCHECK` otomatis:

```bash
# Cek status container
docker inspect --format='{{.State.Health.Status}}' anichin-web

# Lihat history healthcheck
docker inspect --format='{{json .State.Health.Log}}' anichin-web | jq
```

---

## License

MIT License — lihat file [LICENSE](./LICENSE) untuk detail lengkap (jika ada).
Singkatnya: bebas digunakan, dimodifikasi, dan didistribusikan ulang dengan atribusi.

---

## Acknowledgments

- 🎨 **[AniList](https://anilist.co)** — sumber metadata anime (GraphQL API publik gratis).
- 🎨 **[Jikan](https://jikan.moe)** — REST API untuk MyAnimeList (alternatif data source).
- 🧩 **[shadcn/ui](https://ui.shadcn.com)** — koleksi komponen UI yang dapat di-own (radix primitives + Tailwind).
- 🎨 **[Radix UI](https://radix-ui.com)** — primitive komponen accessible (a11y-first).
- 🚀 **[Next.js](https://nextjs.org)** — React framework production-grade.
- 💾 **[Prisma](https://prisma.io)** — type-safe ORM untuk Node.js.
- 🐰 **[Bun](https://bun.sh)** — runtime JavaScript/TypeScript super cepat.
- 🎬 **[anichin.moe](https://anichin.moe)** — inspirasi desain & UX.

---

<div align="center">

**Dibuat dengan ❤️ untuk komunitas anime Indonesia.**

</div>
