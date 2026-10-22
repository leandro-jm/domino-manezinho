import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra os servidores de dev. Se já estiverem de pé, reaproveita; senão sobe os dois.
 * Precisa do Postgres do infra/docker-compose.yml e do apps/server/.env.
 */
export default defineConfig({
  testDir: '.',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @domino/server dev',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @domino/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
