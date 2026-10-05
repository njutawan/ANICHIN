#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * AniChin — Universal build script
 * Detects deployment target (Vercel vs Docker/standalone) and runs appropriate build.
 *
 * - Vercel: `next build` only (Vercel has native Next.js support)
 * - Docker: `next build` + copy static/public to standalone (for self-hosted server)
 * - Local dev: same as Docker (for testing standalone output)
 *
 * Vercel auto-detection: VERCEL=1 env var (set automatically by Vercel)
 * Docker detection: DEPLOY_TARGET=standalone env var (set in Dockerfile)
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { resolveCliCommand, formatCliCommand } = require('./lib/resolve-cli');

const isVercel = process.env.VERCEL === '1';
const isStandalone = !isVercel && process.env.DEPLOY_TARGET === 'standalone';

/**
 * Jalankan `{ file, args }` TANPA shell dan kembalikan sukses/gagal.
 *
 * Tidak ada string perintah yang digabung lalu di-parse shell — itu sumber
 * temuan CodeQL `js/shell-command-injection-from-environment` (alert #8 & #9)
 * dan `js/indirect-command-line-injection` (alert #10). Resolver memilih file
 * JS entry point milik paket dan menjalankannya lewat `process.execPath`,
 * jadi tidak ada interpreter perantara yang bisa disalahgunakan, termasuk
 * untuk path yang mengandung spasi.
 */
function runCli(invocation) {
  const result = spawnSync(invocation.file, invocation.args, { stdio: 'inherit' });
  return !result.error && result.status === 0;
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🏗️  AniChin Build');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Target: ${isVercel ? 'Vercel (serverless)' : isStandalone ? 'Docker (standalone)' : 'Local dev'}`);
console.log(`  Output: ${isVercel ? '.next (Vercel-native)' : '.next/standalone (self-hosted)'}`);
console.log('');

// Step 1: Generate Prisma client (must run BEFORE next build)
// P1-12: jangan asumsikan Bun. Dipakai binary lokal node_modules/.bin/prisma
// (hasil `npm install` / `bun install` / `pnpm install`), dengan fallback
// bunx → npx, jadi `npm run build` tetap jalan di environment Node-only.
console.log('▶ Step 1: Generating Prisma client...');
const prismaInvocation = resolveCliCommand('prisma', ['generate']);
if (!prismaInvocation) {
  console.error('✗ Prisma CLI tidak ditemukan (node_modules/.bin/prisma, bunx, npx).');
  console.error('  Jalankan `npm install` (atau `bun install`) lebih dulu.');
  process.exit(1);
}
console.log(`  perintah: ${formatCliCommand(prismaInvocation)}`);
if (!runCli(prismaInvocation)) {
  console.error('✗ Prisma generate failed');
  process.exit(1);
}
console.log('✓ Prisma client generated\n');

// Step 2: Run Next.js build
// Argumen tambahan diteruskan ke `next build` (mis. `node scripts/build.js
// --webpack` untuk memaksa webpack alih-alih Turbopack saat debugging).
const nextArgs = ['build', ...process.argv.slice(2)];
console.log('▶ Step 2: Running next build...');
const nextInvocation = resolveCliCommand('next', nextArgs);
if (!nextInvocation) {
  console.error('✗ Next.js CLI tidak ditemukan (node_modules/.bin/next, bunx, npx).');
  process.exit(1);
}
console.log(`  perintah: ${formatCliCommand(nextInvocation)}`);
if (!runCli(nextInvocation)) {
  console.error('✗ Next.js build failed');
  process.exit(1);
}
console.log('✓ Next.js build complete\n');

// Step 3: For Docker/standalone only — copy static + public into standalone
if (isStandalone) {
  console.log('▶ Step 3: Copying static + public to standalone...');

  const standaloneDir = path.join(process.cwd(), '.next', 'standalone');
  const staticSrc = path.join(process.cwd(), '.next', 'static');
  const staticDest = path.join(standaloneDir, '.next', 'static');
  const publicSrc = path.join(process.cwd(), 'public');
  const publicDest = path.join(standaloneDir, 'public');

  if (!fs.existsSync(standaloneDir)) {
    console.error(`✗ Standalone dir not found: ${standaloneDir}`);
    console.error('  Make sure next.config.ts has output: "standalone" when DEPLOY_TARGET=standalone');
    process.exit(1);
  }

  // Copy .next/static → .next/standalone/.next/static
  if (fs.existsSync(staticSrc)) {
    fs.cpSync(staticSrc, staticDest, { recursive: true });
    console.log(`✓ Copied .next/static → .next/standalone/.next/static`);
  }

  // Copy public → .next/standalone/public
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true });
    console.log(`✓ Copied public → .next/standalone/public`);
  }
  console.log('');
} else {
  console.log('▶ Step 3: Skipped (Vercel handles static assets automatically)\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  ✅ Build complete!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (isVercel) {
  console.log('  Vercel will now deploy the .next/ directory.');
} else if (isStandalone) {
  console.log('  Run the standalone server with:');
  console.log('    NODE_ENV=production node .next/standalone/server.js');
} else {
  console.log('  For local testing:');
  console.log('    bun run start  (uses standalone server)');
  console.log('  For Vercel deploy:');
  console.log('    Push to GitHub → connect to Vercel → auto-deploy');
}
console.log('');
