/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * AniChin — resolusi CLI build tanpa asumsi package manager.
 *
 * P1-12: `scripts/build.js` dulu memanggil `bunx prisma generate` secara
 * hard-code. Akibatnya `npm run build`, `pnpm build`, atau `node
 * scripts/build.js` gagal di mesin tanpa Bun — padahal README hanya
 * mensyaratkan Node 20+ (Prisma & Next sendiri terpasang di node_modules).
 *
 * Strategi: jalankan entry point JS milik paket (`node_modules/prisma/build/
 * index.js`, `node_modules/next/dist/bin/next`) memakai `process.execPath`
 * lebih dulu, baru shim lokal `node_modules/.bin/<cli>` (POSIX), lalu
 * `bunx`, lalu `npx`.
 *
 * Keamanan (CodeQL): semua perintah direpresentasikan sebagai `{ file, args }`
 * dan dijalankan `spawnSync` TANPA shell. Menyusun string perintah lalu
 * `execSync()` memicu `js/shell-command-injection-from-environment`
 * (alert #8 & #9) dan `js/indirect-command-line-injection` (alert #10), dan
 * menjalankan shim `.cmd` lewat interpreter perantara (`cmd.exe`) juga
 * terdeteksi sebagai shell command injection — jadi jalur itu dihindari.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const isWindows = process.platform === 'win32';

/**
 * Entry point JS dari CLI yang kita butuhkan, relatif terhadap root proyek.
 *
 * Dijalankan dengan `process.execPath` (Node/Bun yang sedang dipakai), jadi
 * aman di semua platform: tanpa shell, tanpa shim `.cmd`/`.bat` (Node ≥20.12
 * menolak spawn shim itu langsung dengan `EINVAL`), dan tanpa `cmd.exe`.
 */
const CLI_ENTRYPOINTS = {
  prisma: ['node_modules/prisma/build/index.js'],
  next: ['node_modules/next/dist/bin/next'],
};

/** Lokasi binary lokal hasil install package manager mana pun. */
function localBinPath(name, cwd = process.cwd()) {
  return path.join(cwd, 'node_modules', '.bin', isWindows ? `${name}.cmd` : name);
}

/** Lokasi entry point JS lokal, kalau paketnya memasang CLI yang dikenal. */
function localEntryPath(name, cwd = process.cwd(), exists = fs.existsSync) {
  for (const relative of CLI_ENTRYPOINTS[name] ?? []) {
    const candidate = path.join(cwd, relative);
    if (exists(candidate)) return candidate;
  }
  return null;
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
 * Urutan: entry point JS → shim binary lokal → bunx → npx; `null` berarti
 * tidak ada yang tersedia.
 *
 * Hasilnya `{ file, args }` — siap dipakai `spawnSync(file, args)` sehingga
 * path/argumen tidak pernah di-parse ulang oleh shell.
 */
function pickCliCommand({ name, args = [], localEntry, localBin, localExists = false, bunx = false, npx = false }) {
  const rest = normalizeArgs(args);
  if (localEntry) return { file: process.execPath, args: [localEntry, ...rest] };
  if (localExists && localBin) return { file: localBin, args: rest };
  if (bunx) return { file: 'bunx', args: [name, ...rest] };
  if (npx) return { file: 'npx', args: ['--yes', name, ...rest] };
  return null;
}

/**
 * Perintah siap-pakai untuk CLI `name`, atau `null` kalau tidak ada entry
 * point lokal, binary lokal, maupun `bunx`/`npx` di PATH.
 *
 * Catatan Windows: shim `.cmd` tidak dipakai (tidak bisa di-spawn langsung),
 * jadi di sana urutannya entry point JS → bunx/npx.
 */
function resolveCliCommand(name, args = [], options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const exists = options.exists || fs.existsSync;
  const available = options.available || commandAvailable;

  const localEntry = localEntryPath(name, cwd, exists);
  const localBin = localBinPath(name, cwd);
  const localBinExists = !isWindows && Boolean(exists(localBin));

  return pickCliCommand({
    name,
    args,
    localEntry,
    localBin,
    localExists: localBinExists,
    bunx: available('bunx'),
    npx: available('npx'),
  });
}

/** String untuk pesan log saja — tidak pernah dieksekusi lewat shell. */
function formatCliCommand({ file, args }) {
  return [file, ...args].join(' ');
}

module.exports = { localBinPath, localEntryPath, pickCliCommand, resolveCliCommand, formatCliCommand };
