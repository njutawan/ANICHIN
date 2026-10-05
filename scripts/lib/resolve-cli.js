/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * AniChin — resolusi CLI build tanpa asumsi package manager.
 *
 * P1-12: `scripts/build.js` dulu memanggil `bunx prisma generate` secara
 * hard-code. Akibatnya `npm run build`, `pnpm build`, atau `node
 * scripts/build.js` gagal di mesin tanpa Bun — padahal README hanya
 * mensyaratkan Node 20+ (Prisma & Next sendiri terpasang di node_modules).
 *
 * Strategi: pakai binary lokal `node_modules/.bin/<cli>` lebih dulu (dipasang
 * oleh npm, bun, maupun pnpm), baru jatuh ke `bunx`, lalu `npx`.
 *
 * Keamanan (CodeQL): semua perintah direpresentasikan sebagai `{ file, args }`
 * dan dijalankan `spawnSync` TANPA shell. Menyusun string perintah lalu
 * `execSync()` memicu `js/shell-command-injection-from-environment`
 * (alert #8 & #9) dan `js/indirect-command-line-injection` (alert #10).
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const isWindows = process.platform === 'win32';

/** Lokasi binary lokal hasil install package manager mana pun. */
function localBinPath(name, cwd = process.cwd()) {
  return path.join(cwd, 'node_modules', '.bin', isWindows ? `${name}.cmd` : name);
}

/** Probe default `<file> --version` tanpa shell; throw kalau tidak ada/gagal. */
function probeCommand(file) {
  const result = spawnSync(file, ['--version'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`${file} --version exited with code ${result.status}`);
  }
}

/** Cek perintah ada di PATH (dipakai hanya kalau binary lokal tidak ada). */
function commandAvailable(file, run = probeCommand) {
  try {
    run(file);
    return true;
  } catch {
    return false;
  }
}

/** Normalisasi argumen: array dipakai apa adanya, string lama dipecah per spasi. */
function normalizeArgs(args) {
  if (Array.isArray(args)) return args;
  if (typeof args === 'string' && args.trim()) return args.trim().split(/\s+/);
  return [];
}

/**
 * Logika pemilihan perintah — murni (tanpa I/O) supaya bisa diuji unit.
 * Urutan: binary lokal → bunx → npx; `null` berarti tidak ada yang tersedia.
 *
 * Hasilnya `{ file, args }` — siap dipakai `spawnSync(file, args)` sehingga
 * path/argumen tidak pernah di-parse ulang oleh shell.
 */
function pickCliCommand({ name, args = [], localBin, localExists = false, bunx = false, npx = false }) {
  const rest = normalizeArgs(args);
  if (localExists && localBin) return { file: localBin, args: rest };
  if (bunx) return { file: 'bunx', args: [name, ...rest] };
  if (npx) return { file: 'npx', args: ['--yes', name, ...rest] };
  return null;
}

/**
 * Perintah siap-pakai untuk CLI `name`, atau `null` kalau tidak ada binary
 * lokal maupun `bunx`/`npx` di PATH.
 */
function resolveCliCommand(name, args = [], options = {}) {
  const localBin = localBinPath(name, options.cwd);
  const exists = options.exists || fs.existsSync;
  const available = options.available || commandAvailable;

  return pickCliCommand({
    name,
    args,
    localBin,
    localExists: Boolean(exists(localBin)),
    bunx: available('bunx'),
    npx: available('npx'),
  });
}

/** String untuk pesan log saja — tidak pernah dieksekusi lewat shell. */
function formatCliCommand({ file, args }) {
  return [file, ...args].join(' ');
}

module.exports = { localBinPath, pickCliCommand, resolveCliCommand, formatCliCommand };
