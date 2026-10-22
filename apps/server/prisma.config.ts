import { defineConfig } from 'prisma/config';

// Prisma 7 não lê o .env sozinho.
try {
  process.loadEnvFile();
} catch {
  // sem .env: usa o ambiente
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://domino:domino@localhost:5442/domino' },
});
