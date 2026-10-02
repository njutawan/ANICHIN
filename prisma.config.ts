import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * NOTE on environment variables: begitu ada file ini, Prisma CLI BERHENTI
 * memuat `.env` secara otomatis ("Prisma config detected, skipping environment
 * variable loading"), sehingga `DATABASE_URL` harus tersedia di environment.
 * `import 'dotenv/config'` di bawah memuat `.env` untuk pemakaian lokal,
 * sementara container/CI tetap bisa mengirim env var langsung (nilai env yang
 * sudah ada tidak ditimpa dotenv).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
});
