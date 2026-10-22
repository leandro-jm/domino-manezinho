import { defineConfig } from 'vitest/config';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://domino:domino@localhost:5442/domino_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Todos os arquivos usam o mesmo banco de teste.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: TEST_DATABASE_URL, JWT_SECRET: 'segredo-de-teste' },
  },
});
