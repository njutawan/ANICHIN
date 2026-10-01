import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * NOTE on environment variables: this config file does NOT load `.env` by
 * itself (there is no dotenv import here). Prisma's CLI still reads a `.env`
 * next to the schema/package root for most commands, but if a command reports
 * `Environment variable not found: DATABASE_URL`, export it explicitly first:
 *
 *   set -a && . ./.env && set +a        # bash
 *   bunx prisma migrate deploy
 *
 * (Prisma 7 will require `import 'dotenv/config'` here — the `dotenv` package is
 * already available transitively, and will become a direct dependency then.)
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
});
