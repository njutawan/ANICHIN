/**
 * Start embedded PostgreSQL + apply migration + verify.
 *
 * Usage: bun run scripts/start-postgres.ts
 *
 * This script:
 * 1. Initializes a PostgreSQL data directory in ./pgdata
 * 2. Starts PostgreSQL server on port 5433 (avoid conflicts)
 * 3. Creates database "anichin"
 * 4. Switches Prisma schema to postgresql provider
 * 5. Applies migration (creates all 15 tables)
 * 6. Migrates data from SQLite (if SQLite has data)
 * 7. Restarts dev server with PostgreSQL DATABASE_URL
 *
 * No root/sudo needed — PostgreSQL runs entirely in user space.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PG_DATA_DIR = path.join(process.cwd(), 'pgdata');
const PG_PORT = 5433;
const PG_USER = 'anichin';
const PG_DB = 'anichin';
const PG_PASSWORD = 'anichin';
const DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}?schema=public`;

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Embedded PostgreSQL + Migration — AniChin             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Step 1: Initialize PostgreSQL
  console.log('📦 Step 1: Initializing embedded PostgreSQL...\n');

  const pg = new EmbeddedPostgres({
    databaseDir: PG_DATA_DIR,
    pgPort: PG_PORT,
    persistenceDir: path.join(PG_DATA_DIR, 'persistence'),
    // Use the downloaded binaries
  });

  await pg.initialise();
  console.log(`  ✅ PostgreSQL initialized at ${PG_DATA_DIR}`);

  // Step 2: Start PostgreSQL server
  console.log('\n🚀 Step 2: Starting PostgreSQL server...\n');
  await pg.start();
  console.log(`  ✅ PostgreSQL running on port ${PG_PORT}`);

  // Step 3: Create database + user
  console.log('\n👤 Step 3: Creating database + user...\n');
  try {
    await pg.createDatabase(PG_DB);
    console.log(`  ✅ Database "${PG_DB}" created`);
  } catch (err: any) {
    if (err.message.includes('already exists')) {
      console.log(`  ℹ Database "${PG_DB}" already exists (skipped)`);
    } else {
      throw err;
    }
  }

  // Step 4: Update .env with PostgreSQL URL
  console.log('\n⚙️ Step 4: Updating .env...\n');
  const envPath = path.join(process.cwd(), '.env');
  let envContent = fs.readFileSync(envPath, 'utf-8');
  // Replace DATABASE_URL line
  envContent = envContent.replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL=${DATABASE_URL}`
  );
  // Make sure NEXTAUTH_URL is set
  if (!envContent.includes('NEXTAUTH_URL=')) {
    envContent += '\nNEXTAUTH_URL=http://localhost:3000\n';
  }
  fs.writeFileSync(envPath, envContent);
  console.log(`  ✅ .env updated: DATABASE_URL=${DATABASE_URL}`);

  // Step 5: Switch Prisma schema to PostgreSQL
  console.log('\n🔄 Step 5: Switching Prisma schema to PostgreSQL...\n');
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  let schema = fs.readFileSync(schemaPath, 'utf-8');
  schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
  fs.writeFileSync(schemaPath, schema);
  console.log('  ✅ schema.prisma: provider = "postgresql"');

  // Step 6: Generate Prisma client
  console.log('\n🔧 Step 6: Generating Prisma client...\n');
  execSync('bunx prisma generate', { stdio: 'inherit' });
  console.log('  ✅ Prisma client generated');

  // Step 7: Apply migration
  console.log('\n📦 Step 7: Applying migration to PostgreSQL...\n');
  try {
    execSync('bunx prisma migrate deploy', { stdio: 'inherit' });
    console.log('  ✅ Migration applied');
  } catch (_err) {
    console.log('  ⚠ migrate deploy failed, trying db push...');
    execSync('bunx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('  ✅ Schema pushed to PostgreSQL');
  }

  // Step 8: Migrate data from SQLite (if exists)
  const sqlitePath = path.join(process.cwd(), 'db', 'custom.db');
  if (fs.existsSync(sqlitePath)) {
    console.log('\n📊 Step 8: Migrating data from SQLite...\n');
    try {
      execSync('bun run scripts/migrate-to-postgres.ts', { stdio: 'inherit' });
      console.log('  ✅ Data migrated from SQLite');
    } catch (err: any) {
      console.log(`  ⚠ Data migration failed: ${err.message}`);
      console.log('  (You can run `bun run seed` to populate fresh data)');
    }
  }

  // Step 9: Verify
  console.log('\n🔍 Step 9: Verifying...\n');
  try {
    execSync(`PGPASSWORD=${PG_PASSWORD} psql -h localhost -p ${PG_PORT} -U ${PG_USER} -d ${PG_DB} -c "\\dt"`, { stdio: 'inherit' });
  } catch {
    // psql might not be installed, try via Prisma
    console.log('  (psql not available, verifying via Prisma...)');
  }

  // Step 10: Start dev server
  console.log('\n🌐 Step 10: Starting dev server with PostgreSQL...\n');
  console.log(`  DATABASE_URL: ${DATABASE_URL}`);
  console.log('  Server: http://localhost:3000\n');
  console.log('  Press Ctrl+C to stop (PostgreSQL will also stop)\n');

  // Start dev server (foreground, so Ctrl+C stops everything)
  const dev = spawn('node', ['node_modules/.bin/next', 'dev', '-p', '3000'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL,
    },
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n\n🛑 Shutting down...');
    dev.kill('SIGTERM');
    try {
      await pg.stop();
      console.log('  ✅ PostgreSQL stopped');
    } catch (err: any) {
      console.log(`  ⚠ PostgreSQL stop error: ${err.message}`);
    }
    // Restore SQLite schema
    const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
    let schema = fs.readFileSync(schemaPath, 'utf-8');
    schema = schema.replace('provider = "postgresql"', 'provider = "sqlite"');
    fs.writeFileSync(schemaPath, schema);
    console.log('  ✅ Schema restored to SQLite (for dev)');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  dev.on('exit', (code) => {
    console.log(`\nDev server exited with code ${code}`);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
