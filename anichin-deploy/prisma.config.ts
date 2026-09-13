import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Load .env file explicitly (Prisma 6.x doesn't auto-load in some commands)
  migrations: {
    path: 'prisma/migrations',
  },
});
