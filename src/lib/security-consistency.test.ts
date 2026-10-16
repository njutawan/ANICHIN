/**
 * Regresi lintas-file untuk aturan keamanan yang harus sama di **semua** pintu
 * masuk — supaya perbaikan audit tidak "bocor" lewat jalur yang terlupakan.
 *
 * Test ini lahir dari verifikasi ulang batch F-11…F-17, yang menemukan tiga
 * celah konsistensi:
 *   1. `scripts/admin.ts` (CLI operator) juga menetapkan password, tetapi belum
 *      memakai batas bcrypt 72 byte seperti register/reset (F-17).
 *   2. Form register/reset masih memakai `maxLength={1024}`/tanpa batas,
 *      padahal server menolak >72 byte (F-17).
 *   3. `scripts/setup-github-secrets.sh` menyiapkan secret pipeline, tetapi
 *      belum ikut menyiapkan `DEPLOY_HOST_KEY` (F-15) — padahal tanpa secret itu
 *      workflow sengaja gagal di langkah "Siapkan SSH".
 *
 * Semua pemeriksaan membaca file repo apa adanya, jadi jalur baru yang
 * melanggar aturan ini akan langsung terlihat.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

const adminCli = read('scripts/admin.ts');
const registerPage = read('src/app/auth/register/page.tsx');
const resetPage = read('src/app/auth/reset-password/page.tsx');
const registerRoute = read('src/app/api/auth/register/route.ts');
const resetRoute = read('src/app/api/auth/reset-password/route.ts');
const secretsScript = read('scripts/setup-github-secrets.sh');
const caddyfile = read('Caddyfile');
const ipResolver = read('src/lib/ip.ts');
const prodCompose = read('docker-compose.prod.yml');
const stagingCompose = read('docker-compose.staging.yml');
const setupEnvScript = read('scripts/setup-env.sh');
const startPostgresScript = read('scripts/start-postgres.ts');
const migrateToPgScript = read('scripts/migrate-to-pg.ts');

describe('F-17 — setiap jalur yang menetapkan password memakai batas 72 byte', () => {
  it('register & reset (HTTP) memakai helper bersama, bukan angka literal', () => {
    for (const route of [registerRoute, resetRoute]) {
      expect(route).toContain('isPasswordTooLong');
      expect(route).toContain('PASSWORD_MAX_BYTES');
    }
    // Aturan lama (1024 karakter) tidak boleh kembali muncul di validasi server.
    expect(resetRoute).not.toContain('password.length > 1024');
  });

  it('CLI admin (scripts/admin.ts) memakai batas yang sama di create & reset-password', () => {
    expect(adminCli).toContain("from '../src/lib/security'");
    expect(adminCli).toContain('isPasswordTooLong');
    // Dua jalur penetapan password: createAdmin() dan resetPassword().
    expect(adminCli.match(/isPasswordTooLong\(/g)).toHaveLength(2);
    expect(adminCli.match(/hashSync\(/g)?.length).toBe(2);
  });

  it('form register & reset memakai PASSWORD_MAX_BYTES (bukan 1024/128)', () => {
    // Dua input password di masing-masing form (password + konfirmasi).
    expect(registerPage.match(/maxLength=\{PASSWORD_MAX_BYTES\}/g)).toHaveLength(2);
    expect(resetPage.match(/maxLength=\{PASSWORD_MAX_BYTES\}/g)).toHaveLength(2);
    for (const page of [registerPage, resetPage]) {
      expect(page).not.toContain('maxLength={1024}');
      expect(page).toContain('utf8ByteLength(password) <= PASSWORD_MAX_BYTES');
    }
  });
});

describe('F-15/F-16 — skrip setup secret menyiapkan kredensial baru', () => {
  it('menyetel DEPLOY_HOST_KEY (host key dipin) atau menjelaskan cara mengisinya', () => {
    expect(secretsScript).toContain('set_secret "DEPLOY_HOST_KEY"');
    expect(secretsScript).toContain('DEPLOY_HOST_KEY');
    // Harus ada peringatan mencocokkan fingerprint (bukan TOFU diam-diam).
    expect(secretsScript).toContain('Cocokkan fingerprint');
  });

  it('menyetel POSTGRES_APP_PASSWORD (role aplikasi DML-only)', () => {
    expect(secretsScript).toContain('POSTGRES_APP_PASSWORD=$(openssl rand -hex 32)');
    expect(secretsScript).toContain('set_secret "POSTGRES_APP_PASSWORD"');
  });

  it('tidak menyarankan DATABASE_URL role pemilik untuk aplikasi', () => {
    // DATABASE_URL yang dibentuk skrip ini adalah role migrasi/owner → harus ada
    // catatan eksplisit supaya tidak dipakai menjalankan aplikasi (web = role DML).
    expect(secretsScript).toContain('ROLE MIGRASI/owner');
    expect(secretsScript).toContain('POSTGRES_APP_PASSWORD (audit F-16)');
  });
});

describe('proxy and deployment logging hardening', () => {
  it('Caddy never grants opaque-origin CORS and overwrites client IP headers', () => {
    expect(caddyfile).not.toMatch(/^\s*header\s+Access-Control-Allow-Origin\s+"null"/m);
    expect(caddyfile).toContain('-Access-Control-Allow-Origin');
    expect(caddyfile).toContain('header_up X-Forwarded-For {client_ip}');
    expect(caddyfile).toContain('header_up X-Real-IP {client_ip}');
    expect(caddyfile).toContain('header_up -CF-Connecting-IP');
  });

  it('does not trust forwarded IP headers unless the Caddy hop is explicitly configured', () => {
    expect(ipResolver).toContain("if (raw == null || !/^\\d+$/.test(raw.trim())) return 0;");
    expect(ipResolver).toContain("if (hops === 0) return 'unknown';");
    expect(prodCompose).toContain('TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}');
    expect(stagingCompose).toContain('TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}');
  });

  it('setup and migration scripts never print the DATABASE_URL value', () => {
    expect(setupEnvScript).not.toContain('DATABASE_URL=${DATABASE_URL}');
    expect(startPostgresScript).not.toContain('DATABASE_URL=${DATABASE_URL}');
    expect(migrateToPgScript).not.toContain('Current: ${process.env.DATABASE_URL');
    expect(migrateToPgScript).toContain('DATABASE_URL is ${process.env.DATABASE_URL ? \'set but invalid\' : \'unset\'} (value redacted).');
  });
});
