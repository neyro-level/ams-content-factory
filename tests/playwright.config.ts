import { defineConfig } from '@playwright/test';

export function createPlaywrightConfig({
  port = Number(process.env.E2E_PORT ?? 3000),
  textGeneration = process.env.E2E_TEST_TEXT_GENERATION ?? '1',
}: {
  port?: number;
  textGeneration?: string;
} = {}) {
  return defineConfig({
    testDir: './e2e',
    // A cold CI worker has to start Next.js, compile protected routes and
    // initialise the isolated database. Keep the assertion strict, but allow
    // that first real request enough time instead of treating compilation as a
    // product failure.
    timeout: 90_000,
    expect: {
      timeout: 15_000,
    },
    // Contracts share one Next development server and PostgreSQL instance.
    // Keep their database/auth observations isolated and reproducible in CI.
    workers: 1,
    use: {
      baseURL: `http://127.0.0.1:${port}`,
    },
    webServer: {
      command: `pnpm --filter @ams-content-factory/web exec next dev --port ${port}`,
      port,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_URL: `http://127.0.0.1:${port}`,
        BETTER_AUTH_SECRET: 'e2e-only-auth-secret-that-is-at-least-32-characters',
        TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        E2E_TEST_TEXT_GENERATION: textGeneration,
      },
      reuseExistingServer: !process.env.CI,
    },
  });
}

export default createPlaywrightConfig();
