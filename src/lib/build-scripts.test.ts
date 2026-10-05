/**
 * P1-12 — regresi untuk detail kecil yang dulu menabrak build/deploy:
 *
 *  - `scripts/build.js` tidak boleh mengasumsikan Bun tersedia (dulu hard-code
 *    `bunx prisma generate` → `npm run build` gagal di mesin Node-only).
 *  - `next.config.ts` tidak boleh meng-import devDependency di top-level
 *    (`npm ci --omit=dev` gagal memuat config sama sekali).
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { localBinPath, localEntryPath, pickCliCommand, resolveCliCommand, formatCliCommand } = require('../../scripts/lib/resolve-cli');

const repoRoot = process.cwd();

describe('pickCliCommand (scripts/lib/resolve-cli)', () => {
  it('mengutamakan entry point JS yang dijalankan process.execPath (tanpa shell)', () => {
    const command = pickCliCommand({
      name: 'prisma',
      args: ['generate'],
      localEntry: '/app/node_modules/prisma/build/index.js',
      localBin: '/app/node_modules/.bin/prisma',
      localExists: true,
      bunx: true,
      npx: true,
    });
    expect(command).toEqual({
      file: process.execPath,
      args: ['/app/node_modules/prisma/build/index.js', 'generate'],
    });
  });

  it('mengutamakan binary lokal dari node_modules/.bin kalau entry point tidak ada', () => {
    const command = pickCliCommand({
      name: 'prisma',
      args: ['generate'],
      localBin: '/app/node_modules/.bin/prisma',
      localExists: true,
      bunx: true,
      npx: true,
    });
    expect(command).toEqual({ file: '/app/node_modules/.bin/prisma', args: ['generate'] });
  });

  it('meneruskan path yang mengandung spasi apa adanya (tanpa quoting shell)', () => {
    const command = pickCliCommand({
      name: 'next',
      args: ['build'],
      localBin: '/home/my user/app/node_modules/.bin/next',
      localExists: true,
    });
    expect(command).toEqual({ file: '/home/my user/app/node_modules/.bin/next', args: ['build'] });
  });

  it('jatuh ke bunx kalau binary lokal tidak ada', () => {
    expect(pickCliCommand({ name: 'prisma', args: ['generate'], localExists: false, bunx: true })).toEqual({
      file: 'bunx',
      args: ['prisma', 'generate'],
    });
  });

  it('jatuh ke npx (non-interaktif) kalau bunx juga tidak ada — inilah jalur Node-only', () => {
    expect(pickCliCommand({ name: 'prisma', args: ['generate'], localExists: false, npx: true })).toEqual({
      file: 'npx',
      args: ['--yes', 'prisma', 'generate'],
    });
  });

  it('mengembalikan null kalau tidak ada CLI sama sekali', () => {
    expect(pickCliCommand({ name: 'prisma', args: ['generate'] })).toBeNull();
  });
});

describe('scripts/build.js (P1-12)', () => {
  const source = readFileSync(path.join(repoRoot, 'scripts', 'build.js'), 'utf8');

  it('tidak lagi meng-hard-code bunx untuk Prisma/Next', () => {
    expect(source).not.toMatch(/bunx prisma generate/);
  });

  it('tidak menyusun string perintah untuk shell (alert CodeQL #8–#10)', () => {
    // Perintah harus dijalankan lewat spawnSync(file, args) tanpa shell —
    // bukan execSync("cmd args") yang memicu shell-command-injection.
    expect(source).not.toMatch(/execSync\(/);
    expect(source).toMatch(/spawnSync\(/);
  });

  it('tidak memakai interpreter perantara (shell: true / batch shim Windows)', () => {
    // Jalur `cmd.exe /c <shim .cmd>` ikut terdeteksi CodeQL sebagai shell
    // command injection, jadi diganti entry point JS + process.execPath.
    expect(source).not.toMatch(/cmd\.exe|ComSpec/);
    expect(source).not.toMatch(/shell\s*:\s*true/);
  });

  it('memakai resolver yang punya fallback bunx → npx', () => {
    expect(source).toMatch(/resolveCliCommand\('prisma'/);
    expect(source).toMatch(/resolveCliCommand\('next'/);
  });
});

describe('resolveCliCommand', () => {
  it('memakai entry point JS lokal repo ini (npm/bun/pnpm tidak relevan)', () => {
    const entry = localEntryPath('prisma');
    const command = resolveCliCommand('prisma', ['generate']);

    if (entry) {
      expect(command).toEqual({ file: process.execPath, args: [entry, 'generate'] });
    } else if (process.platform !== 'win32' && existsSync(localBinPath('prisma'))) {
      expect(command).toEqual({ file: localBinPath('prisma'), args: ['generate'] });
    } else {
      // Lingkungan eksotis (PnP): harus tetap ada fallback, bukan crash.
      expect(['bunx', 'npx']).toContain(command?.file);
    }
  });

  it('entry point JS disuntikkan tanpa menyentuh filesystem', () => {
    const entry = path.join('/repo', 'node_modules', 'prisma', 'build', 'index.js');
    const command = resolveCliCommand('prisma', ['generate'], {
      cwd: '/repo',
      exists: (file: string) => file === entry,
      available: () => false,
    });
    expect(command).toEqual({ file: process.execPath, args: [entry, 'generate'] });
  });

  it('tidak menyentuh filesystem/PATH saat dependensinya disuntik', () => {
    const command = resolveCliCommand('next', ['build'], {
      cwd: '/repo',
      exists: () => false,
      available: (file: string) => file === 'npx',
    });
    expect(command).toEqual({ file: 'npx', args: ['--yes', 'next', 'build'] });
  });

  it('formatCliCommand dipakai hanya untuk log (bukan dieksekusi shell)', () => {
    expect(formatCliCommand({ file: '/a b/next', args: ['build', '--webpack'] })).toBe('/a b/next build --webpack');
  });

  it('path binary lokal mengikuti platform', () => {
    expect(localBinPath('prisma', '/repo')).toBe(
      path.join('/repo', 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma'),
    );
  });
});

describe('next.config.ts (P1-12)', () => {
  const source = readFileSync(path.join(repoRoot, 'next.config.ts'), 'utf8');

  it('tidak meng-import devDependency di top-level', () => {
    expect(source).not.toMatch(/^\s*import\s+[^;]*@next\/bundle-analyzer/m);
  });

  it('meng-import bundle-analyzer secara dinamis dengan spesifier non-literal', () => {
    // Literal string tetap kena TS2307 saat `tsc` jalan tanpa devDependencies,
    // jadi spesifiernya harus lewat variabel.
    expect(source).toMatch(/ANALYZER_PACKAGE\s*=\s*["']@next\/bundle-analyzer["']/);
    expect(source).toMatch(/await import\(ANALYZER_PACKAGE\)/);
    expect(source).toMatch(/ANALYZE/);
  });

  it('tetap bisa dimuat tanpa devDependency dan mempertahankan whitelist gambar', async () => {
    const configModule = await import('../../next.config');
    expect(typeof configModule.default).toBe('function');

    const config = await (configModule.default as () => Promise<{ images?: { remotePatterns?: { hostname: string }[] } }>)();
    const hostnames = (config.images?.remotePatterns ?? []).map((p) => p.hostname);
    expect(hostnames).toEqual(expect.arrayContaining(['s4.anilist.co', 'cdn.myanimelist.net', 'image.tmdb.org']));
    // `**` adalah temuan P1-5 — jangan pernah kembali.
    expect(hostnames).not.toContain('**');
  });
});
