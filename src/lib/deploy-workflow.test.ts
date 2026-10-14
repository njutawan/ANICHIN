/**
 * Regresi audit F-15 — verifikasi host key SSH di pipeline deploy.
 *
 * Temuan: langkah SSH di `.github/workflows/deploy.yml` menjalankan
 *   ssh-keyscan -H "$DEPLOY_HOST" >> ~/.ssh/known_hosts 2>/dev/null || true
 *   ssh -o StrictHostKeyChecking=no …
 * Dua-duanya berbahaya: `|| true` menelan kegagalan keyscan, dan
 * `StrictHostKeyChecking=no` mematikan verifikasi host key — runner menerima
 * kunci apa pun yang menjawab di DEPLOY_HOST. Penyerang yang bisa mencegat
 * koneksi (DNS/ARP/BGP) mendapat kunci image + `.env` + kredensial registry
 * yang dikirim pipeline ini.
 *
 * Perbaikannya (fail closed):
 *   - `ssh-keyscan` tidak lagi dipakai di runner (TOFU);
 *   - known_hosts ditulis dari secret `DEPLOY_HOST_KEY` dan divalidasi cocok
 *     dengan DEPLOY_HOST sebelum perintah pertama;
 *   - semua `ssh`/`scp` memakai `StrictHostKeyChecking=yes` +
 *     `UserKnownHostsFile` eksplisit;
 *   - deploy GAGAL (bukan diam-diam lanjut) bila host key belum dipin.
 *
 * Test ini membaca file workflow apa adanya — sama seperti
 * `src/lib/build-scripts.test.ts` menegakkan aturan pada file repo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const workflowPath = path.join(repoRoot, '.github/workflows/deploy.yml');
const workflow = readFileSync(workflowPath, 'utf8');

// F-15 juga berlaku untuk pipeline staging: ia mengirim .env (rahasia sesi &
// OAuth) ke server yang sama polanya, jadi TOFU di sana sama berbahayanya.
const stagingPath = path.join(repoRoot, '.github/workflows/staging.yml');
const staging = readFileSync(stagingPath, 'utf8');

/** Buang komentar YAML supaya penjelasan "jangan lakukan ini" tidak ikut diuji. */
const effectiveLines = workflow
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'));

describe('deploy.yml — verifikasi host key SSH (audit F-15)', () => {
  it('tidak ada perintah ssh/scp yang melewati verifikasi host key', () => {
    for (const line of effectiveLines) {
      expect(line).not.toContain('StrictHostKeyChecking=no');
      // `=accept-new` masih mempercayai host pada koneksi pertama (TOFU).
      expect(line).not.toContain('StrictHostKeyChecking=accept-new');
    }
  });

  it('ssh-keyscan tidak lagi dipakai di runner (tidak ada TOFU)', () => {
    // Penyebutan di teks `::error::`/annotation (petunjuk operator) masih boleh;
    // yang dilarang adalah menjalankannya atau menelan kegagalannya.
    for (const line of effectiveLines) {
      expect(line).not.toMatch(/(^|[^'\"])\bssh-keyscan\s+-H\b/);
      expect(line).not.toMatch(/ssh-keyscan.*\|\|\s*true/);
    }
  });

  it('setiap ssh/scp memakai StrictHostKeyChecking=yes + UserKnownHostsFile', () => {
    const sshLines = effectiveLines.filter((line) => /\b(ssh|scp)\s+-i\b/.test(line));
    expect(sshLines.length).toBeGreaterThanOrEqual(5); // 1 ssh rollback, 1 ssh + 2 scp upload, 1 ssh bootstrap, 1 ssh deploy
    for (const line of sshLines) {
      expect(line).toContain('StrictHostKeyChecking=yes');
      expect(line).toContain('UserKnownHostsFile="$HOME/.ssh/known_hosts"');
    }
  });

  it('known_hosts ditulis dari secret DEPLOY_HOST_KEY dan isinya divalidasi', () => {
    expect(workflow).toContain('DEPLOY_HOST_KEY: ${{ secrets.DEPLOY_HOST_KEY }}');
    expect(workflow).toContain('printf \'%s\\n\' "$DEPLOY_HOST_KEY" > ~/.ssh/known_hosts');
    // Entri untuk DEPLOY_HOST wajib ada sebelum perintah SSH pertama.
    expect(workflow).toContain('ssh-keygen -F "$DEPLOY_HOST" -f ~/.ssh/known_hosts');
  });

  it('gagal keras (exit 1) bila host key / kunci deploy belum diset', () => {
    const guardBlock = workflow.slice(workflow.indexOf('Siapkan SSH'));
    expect(guardBlock).toContain('if [ -z "$DEPLOY_HOST_KEY" ]; then');
    expect(guardBlock).toContain('if [ -z "$DEPLOY_KEY" ]; then');
    expect(guardBlock).toMatch(/exit 1/);
    expect(workflow).toContain('Host key SSH belum dipin');
  });

  it('urutan langkah: Siapkan SSH sebelum langkah SSH pertama', () => {
    const setupAt = workflow.indexOf('Siapkan SSH');
    const firstSshAt = workflow.indexOf('ssh -i ~/.ssh/deploy_key');
    expect(setupAt).toBeGreaterThan(-1);
    expect(firstSshAt).toBeGreaterThan(setupAt);
  });

  it('langkah SSH tidak lagi menulis kunci sendiri / meng-scan host', () => {
    // Penulisan kunci hanya boleh ada di langkah "Siapkan SSH".
    const keyWrites = effectiveLines.filter((line) =>
      line.includes('> ~/.ssh/deploy_key')
    );
    expect(keyWrites).toHaveLength(1);
    const knownHostsWrites = effectiveLines.filter((line) =>
      line.includes('> ~/.ssh/known_hosts')
    );
    expect(knownHostsWrites).toHaveLength(1);
  });
});

describe('deploy.yml — struktur guard (audit F-15)', () => {
  it('preflight mengekspos host_key dan memberi annotation bila kosong', () => {
    expect(workflow).toContain('host_key: ${{ steps.detect.outputs.host_key }}');
    expect(workflow).toContain('flag host_key   "$DEPLOY_HOST_KEY"');
    expect(workflow).toMatch(/host_key != 'true'/);
  });
});

describe('staging.yml — verifikasi host key SSH (audit F-15)', () => {
  /** Buang komentar YAML (penjelasan "jangan lakukan ini" tidak ikut diuji). */
  const stagingLines = staging
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'));

  it('tidak ada ssh/scp yang melewati verifikasi host key', () => {
    for (const line of stagingLines) {
      expect(line).not.toContain('StrictHostKeyChecking=no');
      expect(line).not.toContain('StrictHostKeyChecking=accept-new');
    }
  });

  it('tidak lagi mengandalkan ssh-keyscan di runner', () => {
    for (const line of stagingLines) {
      expect(line).not.toMatch(/(^|[^'"])\bssh-keyscan\s+-H\b/);
    }
  });

  it('memakai secret host key staging dan gagal keras bila kosong', () => {
    expect(staging).toContain('DEPLOY_HOST_KEY: ${{ secrets.STAGING_DEPLOY_HOST_KEY }}');
    expect(staging).toContain('STAGING_DEPLOY_HOST_KEY kosong');
    expect(staging).toContain('printf \'%s\\n\' "$DEPLOY_HOST_KEY" > ~/.ssh/known_hosts');
    expect(staging).toContain('ssh-keygen -F "$DEPLOY_HOST" -f ~/.ssh/known_hosts');
  });

  it('setiap ssh/scp staging memakai StrictHostKeyChecking=yes', () => {
    const sshLines = stagingLines.filter((line) => /\b(ssh|scp)\s+-i\b/.test(line));
    expect(sshLines.length).toBeGreaterThanOrEqual(3);
    for (const line of sshLines) {
      expect(line).toContain('StrictHostKeyChecking=yes');
      expect(line).toContain('UserKnownHostsFile="$HOME/.ssh/known_hosts"');
    }
  });
});

describe('F-16 — kredensial role aplikasi DB ikut terkirim pipeline', () => {
  it('produksi: bootstrap .env mengirim POSTGRES_APP_PASSWORD', () => {
    expect(workflow).toContain('POSTGRES_APP_PASSWORD: ${{ secrets.POSTGRES_APP_PASSWORD }}');
    expect(workflow).toContain('POSTGRES_APP_PASSWORD=$POSTGRES_APP_PASSWORD');
    // Skrip role ikut diunggah ke server (dipakai mount + compose-deploy.sh).
    expect(workflow).toContain('cp scripts/postgres-init/10-app-role.sh deploy-bundle/scripts/postgres-init/');
  });

  it('staging: bootstrap .env mengirim POSTGRES_APP_PASSWORD', () => {
    expect(staging).toContain('POSTGRES_APP_PASSWORD: ${{ secrets.STAGING_POSTGRES_APP_PASSWORD }}');
    expect(staging).toContain('POSTGRES_APP_PASSWORD=$POSTGRES_APP_PASSWORD');
    expect(staging).toContain('cp scripts/postgres-init/10-app-role.sh deploy-bundle/scripts/postgres-init/');
  });
});
