import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectName = 'ams-content-factory-release-smoke';
const databasePort = process.env.RELEASE_SMOKE_DATABASE_PORT ?? '55462';
const e2ePort = process.env.RELEASE_SMOKE_E2E_PORT ?? '55463';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const externalProviderVariables = [
  'FIRECRAWL_API_KEY',
  'OPENAI_API_KEY',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'VK_CLIENT_ID',
  'VK_CLIENT_SECRET',
  'VK_API_VERSION',
  'INSTAGRAM_APP_ID',
  'INSTAGRAM_APP_SECRET',
  'INSTAGRAM_GRAPH_API_VERSION',
  'HEYGEN_API_KEY',
  'HEYGEN_AVATAR_ID',
  'HEYGEN_VOICE_ID',
  'MOTION_API_KEY',
];

function scrubbedEnvironment() {
  const environment = { ...process.env };
  for (const name of externalProviderVariables) delete environment[name];
  return environment;
}

function assertPorts() {
  for (const [name, value] of [
    ['RELEASE_SMOKE_DATABASE_PORT', databasePort],
    ['RELEASE_SMOKE_E2E_PORT', e2ePort],
  ]) {
    if (!/^\d{2,5}$/.test(value) || Number(value) > 65535) {
      throw new Error(`${name} must be a valid local TCP port.`);
    }
  }
  if (databasePort === e2ePort) {
    throw new Error('RELEASE_SMOKE_DATABASE_PORT and RELEASE_SMOKE_E2E_PORT must differ.');
  }
}

function runtimeEnvironment() {
  return {
    ...scrubbedEnvironment(),
    DATABASE_URL: `postgresql://ams_content_factory_drill:migration_drill_only@127.0.0.1:${databasePort}/ams_content_factory_drill?schema=public`,
    NODE_ENV: 'development',
    APP_URL: `http://127.0.0.1:${e2ePort}`,
    E2E_PORT: e2ePort,
    E2E_LIMITED_PORT: e2ePort,
    BETTER_AUTH_SECRET: 'release-smoke-only-auth-secret-with-at-least-32-characters',
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
  };
}

function run(command, args, environment) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: environment,
      stdio: 'inherit',
      shell: process.platform === 'win32' && command === pnpmCommand,
    });
    child.once('error', rejectRun);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else
        rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function main() {
  assertPorts();
  const environment = runtimeEnvironment();
  const compose = ['compose', '-p', projectName, '-f', 'docker-compose.migration-drill.yml'];
  const composeEnvironment = { ...environment, MIGRATION_DRILL_PORT: databasePort };

  await run('docker', [...compose, 'up', '--detach', '--wait'], composeEnvironment);
  try {
    await run(pnpmCommand, ['prisma:deploy'], environment);
    await run(pnpmCommand, ['db:seed'], environment);
    await run(
      pnpmCommand,
      [
        'exec',
        'playwright',
        'test',
        '--config',
        'tests/playwright.config.ts',
        'tests/e2e/account-organization-brand-flow.spec.ts',
        'tests/e2e/v01-editorial-flow.spec.ts',
        'tests/e2e/v01-tenant-isolation.spec.ts',
      ],
      environment,
    );
    await run(
      pnpmCommand,
      [
        'exec',
        'playwright',
        'test',
        '--config',
        'tests/playwright.limited.config.ts',
        'tests/e2e/v01-limited-capability.spec.ts',
      ],
      environment,
    );
    await run(
      pnpmCommand,
      [
        'exec',
        'vitest',
        'run',
        '--config',
        'tests/vitest.integration.config.ts',
        'tests/integration/worker-readiness-probe.test.ts',
        'tests/integration/publication-dispatch-worker.test.ts',
        'tests/integration/analytics-collection-worker.test.ts',
      ],
      environment,
    );
    process.stdout.write(
      'Release smoke succeeded: local V0.1 editorial, tenant-isolation, limited-capability, worker and sandbox contracts passed. External providers were intentionally absent and their limited-mode paths were required.\n',
    );
  } finally {
    await run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], composeEnvironment);
  }
}

main().catch((error) => {
  process.stderr.write(
    `Release smoke failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
