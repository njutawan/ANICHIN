/**
 * Regresi audit F-16 — least privilege database.
 *
 * Temuan: service `web` (aplikasi) memakai kredensial role PEMILIK database,
 * jadi bug/RCE di aplikasi bisa `DROP`/`ALTER`/`TRUNCATE` tabel. Perbaikannya:
 *   - role aplikasi terpisah (`anichin_app`) dengan hak DML saja;
 *   - role migrasi/owner tetap dipakai `migrate` + `backup-cron`;
 *   - kredensial keduanya berbeda (POSTGRES_PASSWORD vs POSTGRES_APP_PASSWORD);
 *   - skrip pembuat role idempoten, dipakai baik untuk database baru (entrypoint
 *     postgres) maupun yang sudah ada (compose-deploy.sh memanggilnya).
 *
 * Test ini membaca file repo apa adanya (pola `build-scripts.test.ts`), jadi
 * perubahan compose/skrip yang membatalkan pemisahan role akan langsung merah.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

const prodCompose = read('docker-compose.prod.yml');
const stagingCompose = read('docker-compose.staging.yml');
const appRoleScript = read('scripts/postgres-init/10-app-role.sh');
const composeDeploy = read('scripts/compose-deploy.sh');

/** Ambil blok service dari compose (indentasi 2 spasi). */
function serviceBlock(compose: string, name: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  expect(start, `service ${name} tidak ditemukan`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^  [a-zA-Z0-9_-]+:$/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('docker-compose — pemisahan role aplikasi vs migrasi (F-16)', () => {
  it('produksi: web memakai role aplikasi, migrate memakai role owner', () => {
    const web = serviceBlock(prodCompose, 'web');
    const migrate = serviceBlock(prodCompose, 'migrate');

    expect(web).toContain('postgresql://anichin_app:${POSTGRES_APP_PASSWORD:?');
    expect(web).not.toContain('postgresql://anichin:${POSTGRES_PASSWORD');
    expect(migrate).toContain('postgresql://anichin:${POSTGRES_PASSWORD:?');
    expect(migrate).not.toContain('anichin_app');
  });

  it('staging: web memakai role aplikasi, migrate memakai role owner', () => {
    const web = serviceBlock(stagingCompose, 'web');
    const migrate = serviceBlock(stagingCompose, 'migrate');

    expect(web).toContain('postgresql://anichin_staging_app:${POSTGRES_APP_PASSWORD:?');
    expect(web).not.toContain('postgresql://anichin_staging:${POSTGRES_PASSWORD');
    expect(migrate).toContain('postgresql://anichin_staging:${POSTGRES_PASSWORD:?');
    expect(migrate).not.toContain('anichin_staging_app');
  });

  it('db mendeklarasikan role aplikasi dan menolak start tanpa passwordnya', () => {
    for (const compose of [prodCompose, stagingCompose]) {
      const db = serviceBlock(compose, 'db');
      expect(db).toContain('POSTGRES_APP_USER=');
      expect(db).toContain('POSTGRES_APP_PASSWORD=${POSTGRES_APP_PASSWORD:?');
      expect(db).toContain('./scripts/postgres-init:/docker-entrypoint-initdb.d:ro');
    }
  });

  it('skrip role tersedia di runner (bukan hanya di container)', () => {
    expect(existsSync(path.join(repoRoot, 'scripts/postgres-init/10-app-role.sh'))).toBe(true);
  });

  it('ada service `db-roles` yang menyiapkan role pada setiap `up` (database lama)', () => {
    for (const compose of [prodCompose, stagingCompose]) {
      const dbRoles = serviceBlock(compose, 'db-roles');
      expect(dbRoles).toContain('entrypoint: ["sh", "/docker-entrypoint-initdb.d/10-app-role.sh"]');
      expect(dbRoles).toContain('./scripts/postgres-init:/docker-entrypoint-initdb.d:ro');
      // Perlu kredensial owner + alamat db (psql jalan di container terpisah).
      expect(dbRoles).toContain('PGHOST=db');
      expect(dbRoles).toContain('PGPASSWORD=${POSTGRES_PASSWORD:?');
      expect(dbRoles).toContain('POSTGRES_APP_PASSWORD=${POSTGRES_APP_PASSWORD:?');
      // Urutan: setelah migrate, dan web menunggu service ini selesai.
      expect(dbRoles).toMatch(/migrate:\n\s+condition: service_completed_successfully/);
    }

    expect(serviceBlock(prodCompose, 'web')).toMatch(/db-roles:\n\s+condition: service_completed_successfully/);
    expect(serviceBlock(stagingCompose, 'web')).toMatch(/db-roles:\n\s+condition: service_completed_successfully/);
  });
});

describe('scripts/postgres-init/10-app-role.sh (F-16)', () => {
  it('hanya memberi DML (SELECT/INSERT/UPDATE/DELETE) — tanpa DDL', () => {
    expect(appRoleScript).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public');
    for (const forbidden of ['GRANT ALL', 'CREATE ON SCHEMA public TO', 'TRUNCATE', 'ALTER TABLE', 'DROP ']) {
      // Komentar penjelasan boleh menyebutnya; yang dilarang adalah perintahnya.
      const commandLines = appRoleScript
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .filter((line) => line.includes('format('));
      for (const line of commandLines) {
        expect(line).not.toContain(forbidden);
      }
    }
  });

  it('role aplikasi tidak diberi hak istimewa PostgreSQL', () => {
    expect(appRoleScript).toContain('NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
    expect(appRoleScript).toContain('REVOKE CREATE ON SCHEMA public FROM');
  });

  it('privilege default disiapkan untuk tabel baru hasil migrasi', () => {
    expect(appRoleScript).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES');
  });

  it('password tidak pernah masuk argv atau SQL mentah', () => {
    // Nilai dibaca via \getenv + quoting server-side format(%I,%L) → \gexec.
    expect(appRoleScript).toContain('\\getenv app_password POSTGRES_APP_PASSWORD');
    expect(appRoleScript).toContain('%L');
    expect(appRoleScript).not.toMatch(/PASSWORD '/);
    expect(appRoleScript).not.toMatch(/-v\s+app_password=/);
    expect(appRoleScript).not.toContain('$POSTGRES_APP_PASSWORD"');
  });
});

describe('scripts/compose-deploy.sh — role aplikasi disiapkan sebelum up (F-16)', () => {
  it('memanggil skrip role lewat docker compose exec (idempoten)', () => {
    expect(composeDeploy).toContain('compose exec -T db sh /docker-entrypoint-initdb.d/10-app-role.sh');
  });

  it('upgrade pada database lama tidak meninggalkan web tanpa role', () => {
    const provisionAt = composeDeploy.indexOf('10-app-role.sh');
    const upAt = composeDeploy.indexOf('compose up -d $UP_ARGS');
    expect(provisionAt).toBeGreaterThan(-1);
    expect(upAt).toBeGreaterThan(provisionAt);
  });
});
