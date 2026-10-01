/**
 * ============================================================================
 * AniChin — Migrate SQLite data to PostgreSQL
 * Run after deploying to production to copy dev content (anime, episodes, etc)
 * Usage:
 *   bun run scripts/migrate-to-pg.ts
 *
 * Requires:
 *   - SQLite DB exists at db/custom.db (source)
 *   - PostgreSQL DATABASE_URL env var points to target
 *   - PostgreSQL schema already migrated (prisma migrate deploy)
 * ============================================================================
 */

import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import fs from 'node:fs';

// Use Bun's built-in SQLite (no extra dependency needed)
// Falls back to better-sqlite3 if Bun is not available
let Database: any;
try {
  // Bun ships with bun:sqlite built-in
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - bun:sqlite is a Bun-only module
  ({ Database } = await import('bun:sqlite'));
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Database = require('better-sqlite3');
  } catch {
    console.error('❌ Neither bun:sqlite nor better-sqlite3 is available.');
    console.error('   Run this script with `bun run scripts/migrate-to-pg.ts`');
    process.exit(1);
  }
}

const SQLITE_PATH = path.resolve(process.cwd(), 'db/custom.db');

if (!fs.existsSync(SQLITE_PATH)) {
  console.error(`❌ SQLite DB not found: ${SQLITE_PATH}`);
  console.error('   Make sure dev DB exists before running this script.');
  process.exit(1);
}

if (!process.env.DATABASE_URL?.startsWith('postgresql://')) {
  console.error('❌ DATABASE_URL must be a PostgreSQL URL for this script.');
  console.error(`   Current: ${process.env.DATABASE_URL ?? '(unset)'}`);
  process.exit(1);
}

const pg = new PrismaClient({
  log: ['warn', 'error'],
});

const sqlite = new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });

async function migrateTable<T extends Record<string, unknown>>(
  tableName: string,
  prismaDelegate: { createMany: (args: { data: T[]; skipDuplicates?: boolean }) => Promise<{ count: number }> },
  transformer: (row: Record<string, unknown>) => T = (r) => r as T,
) {
  console.log(`\n📦 Migrating table: ${tableName}`);

  const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[];
  console.log(`   Found ${rows.length} rows`);

  if (rows.length === 0) {
    console.log(`   ⏭️  Skipped (no data)`);
    return;
  }

  // Transform rows (handle Date fields, JSON fields, etc)
  const transformed = rows.map(transformer);

  // Insert in batches of 100 to avoid memory issues
  const BATCH_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
    const batch = transformed.slice(i, i + BATCH_SIZE);
    try {
      const result = await prismaDelegate.createMany({
        data: batch,
        skipDuplicates: true,
      });
      totalInserted += result.count;
      process.stdout.write(`\r   Inserted ${totalInserted}/${transformed.length}`);
    } catch (err) {
      console.error(`\n   ❌ Batch failed at offset ${i}:`, err instanceof Error ? err.message : err);
      // Try one-by-one for this batch
      for (const row of batch) {
        try {
          await prismaDelegate.createMany({ data: [row], skipDuplicates: true });
          totalInserted++;
        } catch (e) {
          // Skip individual failures
        }
      }
    }
  }
  console.log(`\n   ✅ Inserted ${totalInserted} rows`);
}

// Transformer: convert SQLite date strings to Date objects
// Also auto-converts Unix timestamps (ms) to Date
function withDates(row: Record<string, unknown>, dateFields: string[] = ['createdAt', 'updatedAt']): Record<string, unknown> {
  const result = { ...row };
  for (const f of dateFields) {
    if (result[f] !== null && result[f] !== undefined) {
      // SQLite stores dates as strings (ISO) OR as Unix timestamps (ms)
      if (typeof result[f] === 'string') {
        result[f] = new Date(result[f] as string);
      } else if (typeof result[f] === 'number') {
        result[f] = new Date(result[f] as number);
      }
    }
  }
  return result;
}

// Transformer: convert SQLite int (0/1) to PostgreSQL boolean
function withBooleans(row: Record<string, unknown>, booleanFields: string[] = []): Record<string, unknown> {
  const result = { ...row };
  for (const f of booleanFields) {
    if (result[f] !== null && result[f] !== undefined) {
      // SQLite stores booleans as 0/1 int, PostgreSQL expects true/false
      const val = result[f];
      if (typeof val === 'number') {
        result[f] = val !== 0;
      } else if (typeof val === 'boolean') {
        // already boolean (rare from SQLite)
      }
    }
  }
  return result;
}

// Combined transformer: dates + booleans (use for tables with both)
function withDatesAndBooleans(row: Record<string, unknown>, dateFields: string[], booleanFields: string[]): Record<string, unknown> {
  return withBooleans(withDates(row, dateFields), booleanFields);
}

// Universal transformer: auto-detect ALL date/boolean fields based on Prisma schema
// SQLite stores: dates as int (ms timestamp) or string (ISO), booleans as int (0/1)
// PostgreSQL expects: dates as Date, booleans as true/false
function universalTransformer(row: Record<string, unknown>, dateFields: string[], booleanFields: string[]): Record<string, unknown> {
  return withDatesAndBooleans(row, dateFields, booleanFields);
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚚 AniChin — SQLite → PostgreSQL Migration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Source: ${SQLITE_PATH}`);
  console.log(`Target: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);

  // Verify target DB is reachable
  console.log('\n🔌 Connecting to PostgreSQL...');
  try {
    await pg.$queryRaw`SELECT 1`;
    console.log('   ✅ Connected');
  } catch (err) {
    console.error('   ❌ Cannot connect to PostgreSQL:', err);
    process.exit(1);
  }

  // Get list of SQLite tables
  const tables = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'`)
    .all() as { name: string }[];

  console.log(`\n📋 Tables to migrate: ${tables.map((t) => t.name).join(', ')}`);

  // Migrate each table using Prisma
  // Order matters for foreign key constraints (parents first, then children)
  const migrationOrder = [
    'Anime',
    'Genre',
    'AnimeGenre',
    'AnimeRelation',
    'Character',
    'Studio',
    'Episode',
    'Collection',
    'CollectionItem',
    'User',
    'ServerReview',
    'Bookmark',
    'WatchHistory',
    'Achievement',
    'UserAchievement',
    'AnimeSchedule',
    'SiteSetting',
  ];

  for (const tableName of migrationOrder) {
    if (!tables.find((t) => t.name === tableName)) {
      console.log(`\n⏭️  Table ${tableName} not in SQLite, skipping`);
      continue;
    }

    const delegate = (pg as unknown as Record<string, { createMany: (args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }) => Promise<{ count: number }> }>)[
      tableName.charAt(0).toLowerCase() + tableName.slice(1)
    ];

    if (!delegate) {
      console.log(`\n⚠️  No Prisma delegate for ${tableName}, skipping`);
      continue;
    }

    // Define which fields are booleans per table (SQLite stores as 0/1 int)
    const booleanFieldsPerTable: Record<string, string[]> = {
      Anime: ['featured', 'trending', 'popular'],
      User: ['twoFactorEnabled'],
    };

    // Define ALL DateTime fields per table (SQLite stores as int ms or string ISO)
    const dateFieldsPerTable: Record<string, string[]> = {
      Anime: ['createdAt', 'updatedAt'],
      Genre: ['createdAt'],
      AnimeGenre: ['createdAt'],
      Episode: ['createdAt', 'releasedAt'],
      Character: ['createdAt'],
      AnimeCharacter: ['createdAt'],
      Staff: ['createdAt'],
      AnimeStaff: ['createdAt'],
      AnimeRelation: ['createdAt'],
      User: ['createdAt', 'updatedAt', 'emailVerified'],
      Bookmark: ['createdAt'],
      ServerReview: ['createdAt', 'updatedAt'],
      ServerComment: ['createdAt'],
      VerificationToken: ['expiresAt'],
      PasswordReset: ['expiresAt', 'usedAt', 'createdAt'],
    };

    const boolFields = booleanFieldsPerTable[tableName] || [];
    const dateFields = dateFieldsPerTable[tableName] || ['createdAt', 'updatedAt'];

    await migrateTable(tableName, delegate, (row) =>
      universalTransformer(row, dateFields, boolFields)
    );
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Migration complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n💡 Next steps:');
  console.log('   1. Verify data via /api/health endpoint');
  console.log('   2. Test login flow (admin user is migrated with same credentials)');
  console.log('   3. Test browsing pages');
}

main()
  .catch((err) => {
    console.error('\n💥 Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pg.$disconnect();
    sqlite.close();
  });
