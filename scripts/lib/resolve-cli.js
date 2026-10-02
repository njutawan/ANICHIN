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
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const isWindows = process.platform === 'win32';

/** Bungkus path dengan tanda kutip kalau mengandung spasi/kutip. */
function quote(value) {
  return /[\s"']/.test(value) ? `"${value}"` : value;
}

/** Lokasi binary lokal hasil install package manager mana pun. */
function localBinPath(name, cwd = process.cwd()) {
  return path.join(cwd, 'node_modules', '.bin', isWindows ? `${name}.cmd` : name);
}

/** Cek perintah ada di PATH (dipakai hanya kalau binary lokal tidak ada). */
function commandAvailable(command, run = execSync) {
  try {
    run(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Logika pemilihan perintah — murni (tanpa I/O) supaya bisa diuji unit.
 * Urutan: binary lokal → bunx → npx; `null` berarti tidak ada yang tersedia.
 */
function pickCliCommand({ name, args = '', localBin, localExists = false, bunx = false, npx = false }) {
  if (localExists && localBin) return `${quote(localBin)} ${args}`.trim();
  if (bunx) return `bunx ${name} ${args}`.trim();
  if (npx) return `npx --yes ${name} ${args}`.trim();
  return null;
}

/**
 * Perintah shell siap-pakai untuk CLI `name`, atau `null` kalau tidak ada
 * binary lokal maupun `bunx`/`npx` di PATH.
 */
function resolveCliCommand(name, args = '', options = {}) {
  const localBin = localBinPath(name, options.cwd);
  const exists = options.exists || fs.existsSync;
  const available = options.available || commandAvailable;

  return pickCliCommand({
    name,
    args,
    localBin,
    localExists: Boolean(exists(localBin)),
    bunx: available('bunx --version'),
    npx: available('npx --version'),
  });
}

module.exports = { localBinPath, pickCliCommand, resolveCliCommand };
