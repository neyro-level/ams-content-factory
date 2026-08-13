import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Contracts share one Next development server and PostgreSQL instance.
  // Keep their database/auth observations isolated and reproducible in CI.
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `pnpm --filter @ams-content-factory/web exec next dev --port ${port}`,
    port,
    env: {
      ...process.env,
      APP_URL: `http://127.0.0.1:${port}`,
      BETTER_AUTH_SECRET: 'e2e-only-auth-secret-that-is-at-least-32-characters',
      TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    },
    reuseExistingServer: !process.env.CI,
  },
});
