# Kebijakan Keamanan (Security Policy)

> _English summary: please report vulnerabilities via GitHub private
> vulnerability reporting — <https://github.com/njutawan/ANICHIN/security/advisories/new>.
> Do not open a public issue for security problems. We aim to acknowledge
> reports within 5 business days and to ship a fix within 30 days for confirmed
> high-severity issues._

Terima kasih sudah membantu menjaga AniChin tetap aman. Dokumen ini menjelaskan
cara melaporkan kerentanan, apa yang termasuk/ tidak termasuk lingkup, dan apa
yang bisa Anda harapkan setelah melapor.

---

## Versi yang didukung

AniChin adalah aplikasi self-hosted — keamanan hanya dijamin pada kode terbaru
di branch `main`. Tidak ada backport untuk fork atau deployment lama.

| Versi | Didukung |
| --- | :---: |
| `main` (rilis terbaru) | ✅ |
| Commit/tag lebih lama | ❌ |

Kalau Anda memakai deployment sendiri, **wajib** mengeset minimal:
`NEXTAUTH_SECRET` (32+ byte acak), `DATABASE_URL` dengan kredensial kuat,
`IP_HASH_SALT`, dan menjalankan `NEXTAUTH_URL` hanya di HTTPS. Lihat
[`.env.example`](./.env.example).

## Cara melaporkan

**Jangan buka issue publik untuk masalah keamanan.**

1. **Cara utama — GitHub private vulnerability reporting:**
   <https://github.com/njutawan/ANICHIN/security/advisories/new>
   (tab **Security → Report a vulnerability**). Laporan hanya terlihat oleh
   maintainer dan bisa didiskusikan, diperbaiki, serta diterbitkan sebagai
   GitHub Security Advisory (CVE bila perlu).
2. **Kalau panel di atas belum aktif** (tombol **Report a vulnerability** tidak
   muncul — fitur ini harus dinyalakan dulu di repo, lihat catatan maintainer di
   bawah): hubungi maintainer lewat DM/kanal pribadi di profil GitHub
   [@njutawan](https://github.com/njutawan). Sertakan `SECURITY` di awal pesan
   dan **jangan** tempel detail eksploitasi di issue publik, diskusi, atau PR.

> **Catatan untuk maintainer:** private vulnerability reporting (PVR) adalah
> setelan per repositori dan **belum aktif** — status per 2026-10-05 lewat
> `gh api repos/njutawan/ANICHIN/private-vulnerability-reporting` adalah
> `{"enabled":false}`, jadi kanal (1) belum bisa dipakai dan pelapor jatuh ke
> kanal (2). Cara mengaktifkan:
>
> - **UI:** <https://github.com/njutawan/ANICHIN/settings/security_analysis> →
>   **Private vulnerability reporting → Enable**
>   ([dokumentasi](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository));
> - **API/verifikasi:** `./scripts/setup-private-vulnerability-reporting.sh`
>   (cek status) atau `… --enable` (aktifkan). Endpoint
>   `PUT /repos/{owner}/{repo}/private-vulnerability-reporting` butuh token
>   dengan **Administration: read and write** (fine-grained PAT/GitHub App)
>   atau scope `public_repo`/`repo` (classic PAT). Token integrasi tanpa izin
>   itu ditolak `403 "Resource not accessible by integration"` — ini penyebab
>   403 yang sudah kami verifikasi, bukan bug pada setelannya.
>
> Template issue di `.github/ISSUE_TEMPLATE/` sudah mengarahkan pelapor ke
> halaman advisory ini supaya kerentanan tidak dibuka sebagai issue publik.

Sertakan hal-hal berikut agar bisa langsung kami reproduksi:

- deskripsi singkat + **dampak** (apa yang bisa dilakukan penyerang);
- langkah reproduksi / PoC minimal (curl, request, atau skrip);
- versi: commit SHA (`git rev-parse HEAD`) dan cara deploy (Docker / Vercel / bare metal);
- apakah butuh login, dan role apa (user/admin);
- log atau tangkapan layar bila relevan;
- usulan perbaikan kalau ada.

**Jangan pernah** menyertakan secret produksi, data pengguna asli, atau token
sah dalam laporan. Kalau Anda menemukan secret yang **bocor** (mis. tertulis di
repo), beri tahu kami dulu agar bisa dirotasi — jangan menyalahgunakannya.

## Yang bisa Anda harapkan

| Tahap | Target |
| --- | --- |
| Konfirmasi laporan diterima | ≤ 5 hari kerja |
| Penilaian awal + severity | ≤ 10 hari kerja |
| Perbaikan untuk isu severity tinggi/kritis | ≤ 30 hari |
| Perbaikan untuk severity sedang/rendah | diskusikan, biasanya rilis berikutnya |
| Publikasi advisory | setelah perbaikan terpasang, atas kesepakatan pelapor |

Ini target *best effort* proyek yang dikelola kecil, bukan SLA kontraktual.
Kami akan memberi kabar kalau jadwalnya bergeser. Nama pelapor akan
dicantumkan di advisory kecuali Anda minta anonim.

## Lingkup

**Termasuk lingkup** (contoh, bukan daftar lengkap):

- bypass autentikasi/otorisasi: login, 2FA (TOTP & backup code), sesi/JWT,
  `requireAdmin()` di route `/api/admin/*`, IDOR pada komentar/ulasan/anime;
- bypass rate limit / login lockout, termasuk spoofing IP lewat header
  `X-Forwarded-For` (`src/lib/ip.ts`);
- XSS (termasuk yang melewati nonce CSP), CSRF, SSRF, injeksi (SQL/NoSQL/command),
  path traversal, prototype pollution, open redirect;
- kebocoran data sensitif: hash password, secret 2FA, `.env`, audit log, error DB;
- penyalahgunaan fitur server: `/api/og` & `/api/anime/[slug]/jsonld` sebagai
  mesin pemroses, `/_next/image` sebagai proxy/SSRF (whitelist host ada di
  `src/lib/image-hosts.ts` — laporan bahwa host di luar daftar ditolak **bukan**
  kerentanan);
- eskalasi hak akses dari user biasa ke admin, atau akses ke data pengguna lain.

**Tidak termasuk lingkup:**

- laporan hasil scanner otomatis tanpa bukti eksploitasi/dampak;
- DoS/DDoS berbasis volume, spam, atau rate limit yang memang berfungsi;
- self-XSS, klik berulang, atau isu yang butuh akses fisik ke perangkat korban;
- dependensi pihak ketiga tanpa jalur eksploitasi nyata di aplikasi ini (laporkan
  ke upstream; kami tetap tertarik pada advisory yang memengaruhi kami);
- header keamanan pada aset statis/`_next/*` yang memang dikecualikan proxy
  (`src/proxy.ts`);
- teks/UI kosmetik, atau klaim tanpa dampak keamanan (mis. versi library);
- deployment pihak ketiga yang tidak memakai kode di repo ini, atau stack yang
  sudah kedaluwarsa (> 1 rilis mayor dari `main`).

## Safe harbor

Kami tidak akan menempuh jalur hukum terhadap riset keamanan yang:

- dilakukan dengan itikad baik dan hanya pada instance milik Anda sendiri
  (self-host) atau instance uji kami;
- tidak merusak, tidak mengubah, dan tidak mengakses data pengguna lain;
- memberi waktu perbaikan sebelum publikasi (coordinated disclosure), sesuai
  jadwal di atas.

Aktivitas di atas **tidak** memberi izin untuk menguji instance produksi
`anichin.id` tanpa persetujuan tertulis.

## Praktik keamanan yang sudah ada

Supaya laporan tidak tumpang tindih dengan hal yang sudah disengaja, ringkasan
kontrol yang sudah terpasang ada di tabel **"Yang sudah bagus"** pada
[`docs/CODE-REVIEW.md`](./docs/CODE-REVIEW.md) — antara lain: CSP berbasis nonce,
11 security header di `src/proxy.ts`, 2FA TOTP + backup code terenkripsi
AES-256-GCM, rate limiting 3 tingkat + lockout login, audit log ber-`IP_HASH_SALT`,
`bun audit --production` yang memblokir CI, serta validasi input terpusat (Zod).

## Menjaga kerahasiaan

- Jangan menyimpan secret di issue, PR, atau chat.
- Kalau ada secret yang bocor: rotasi **lebih dulu**, baru beri tahu kami.
- Kami akan mempublikasikan advisory setelah perbaikan rilis; kredit pelapor
  bersifat default (opt-out kapan saja).
