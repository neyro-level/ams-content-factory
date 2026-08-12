import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `pnpm --filter @ams-content-factory/web exec next dev --port ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
  },
});
