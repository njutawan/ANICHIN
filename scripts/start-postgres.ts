/**
 * Start embedded PostgreSQL untuk pengembangan lokal + verifikasi.
 *
 * Usage: bun run scripts/start-postgres.ts
 *
 * Yang dilakukan:
 * 1. Inisialisasi data directory PostgreSQL di ./pgdata (user space, tanpa sudo)
 * 2. Jalankan server di port 5433
 * 3. Buat database "anichin"
 * 4. Tulis DATABASE_URL ke .env (jika belum menunjuk ke port 5433)
 * 5. Generate Prisma client
 * 6. Terapkan migrasi (prisma migrate deploy)
 * 7. Isi data contoh (opsional: SEED=1 bun run scripts/start-postgres.ts)
 * 8. Jalankan `next dev` di http://localhost:3000
 *
 * CATATAN: script ini sebelumnya masih mengacu ke era SQLite (mengganti
 * provider schema menjadi sqlite saat shutdown, membaca db/custom.db, dan
 * memanggil scripts/migrate-to-postgres.ts yang tidak ada). Schema sekarang
 * PostgreSQL-only, jadi langkah-langkah itu dihapus.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PG_DATA_DIR = path.join(process.cwd(), 'pgdata');
const PG_PORT = 5433;
const PG_USER = 'anichin';
const PG_PASSWORD = 'anichin';
const PG_DB = 'anichin';
const DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}?schema=public`;
const DEV_PORT = process.env.PORT ?? '3000';

function run(cmd: string, env: NodeJS.ProcessEnv = {}) {
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, DATABASE_URL, ...env } });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Embedded PostgreSQL — AniChin (dev)                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('📦 1/6 Inisialisasi PostgreSQL...');
  const pg = new EmbeddedPostgres({
    databaseDir: PG_DATA_DIR,
    pgPort: PG_PORT,
    persistenceDir: path.join(PG_DATA_DIR, 'persistence'),
  });
  await pg.initialise();

  console.log('\n🚀 2/6 Menjalankan server PostgreSQL...');
  await pg.start();

  console.log('\n👤 3/6 Membuat database...');
  try {
    await pg.createDatabase(PG_DB);
    console.log(`  ✅ Database "${PG_DB}" dibuat`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('already exists')) {
      console.log(`  ℹ Database "${PG_DB}" sudah ada (dilewati)`);
    } else {
      throw err;
    }
  }

  console.log('\n⚙️ 4/6 Menulis .env...');
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(path.join(process.cwd(), '.env.example'), envPath);
    console.log('  ℹ .env dibuat dari .env.example — lengkapi NEXTAUTH_SECRET dulu!');
  }
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const updated = /^DATABASE_URL=.*$/m.test(envContent)
    ? envContent.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${DATABASE_URL}"`)
    : `${envContent}\nDATABASE_URL="${DATABASE_URL}"\n`;
  fs.writeFileSync(envPath, updated);
  console.log(`  ✅ DATABASE_URL=${DATABASE_URL}`);

  console.log('\n🔧 5/6 Prisma generate + migrate deploy...');
  run('bunx prisma generate');
  run('bunx prisma migrate deploy');

  if (process.env.SEED === '1') {
    console.log('  🌱 Mengisi data contoh (SEED=1)...');
    run('bun run scripts/seed.ts');
  }

  console.log('\n🌐 6/6 Menjalankan dev server...\n');
  const dev = spawn('bunx', ['next', 'dev', '-p', DEV_PORT], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL },
  });

  const shutdown = async () => {
    console.log('\n\n🛑 Menghentikan...');
    dev.kill('SIGTERM');
    try {
      await pg.stop();
      console.log('  ✅ PostgreSQL dihentikan');
    } catch (err: unknown) {
      console.log(`  ⚠ Gagal menghentikan PostgreSQL: ${err instanceof Error ? err.message : err}`);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  dev.on('exit', (code) => {
    void shutdown().then(() => process.exit(code ?? 0));
  });
}

main().catch((err) => {
  console.error('\n❌ Gagal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
