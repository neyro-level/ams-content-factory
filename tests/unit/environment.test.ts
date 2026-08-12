import { EnvironmentValidationError, readRuntimeConfig } from '../../packages/config/src/index.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const validEnvironment = {
  NODE_ENV: 'production',
  APP_URL: 'https://fabrika.ams24.ru',
  DATABASE_URL: 'postgresql://user:password@db.example.test:5432/app',
  BETTER_AUTH_SECRET: 'test-only-auth-secret-that-is-at-least-32-characters',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
};

describe('runtime environment contract', () => {
  it('accepts a complete production core configuration', () => {
    expect(readRuntimeConfig(validEnvironment)).toMatchObject({
      nodeEnv: 'production',
      appUrl: 'https://fabrika.ams24.ru',
    });
  });

  it('uses a localhost fallback only in development and test', () => {
    expect(
      readRuntimeConfig({ ...validEnvironment, NODE_ENV: 'development', APP_URL: undefined })
        .appUrl,
    ).toBe('http://localhost:3000');
    expect(() => readRuntimeConfig({ ...validEnvironment, APP_URL: undefined })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('fails production configuration before a process can accept traffic', () => {
    expect(() =>
      readRuntimeConfig({
        ...validEnvironment,
        APP_URL: 'http://localhost:3000',
        TOKEN_ENCRYPTION_KEY: 'too-short',
      }),
    ).toThrow(EnvironmentValidationError);
  });

  it('stops the worker before queue startup when production core configuration is absent', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const result = spawnSync(process.execPath, ['--import', 'tsx/esm', 'apps/worker/src/main.ts'], {
      cwd: root,
      env: { NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 5_000,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('Invalid runtime environment');
  });

  it('requires a complete provider credential group once a provider is configured', () => {
    expect(() =>
      readRuntimeConfig({
        ...validEnvironment,
        S3_ENDPOINT: 'https://s3.example.test',
        S3_BUCKET: 'media',
      }),
    ).toThrow(/S3_ENDPOINT/);
  });
});
