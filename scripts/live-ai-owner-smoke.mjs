import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectName = 'ams-content-factory-live-ai-smoke';
const databasePort = process.env.LIVE_AI_SMOKE_DATABASE_PORT ?? '55464';
const browserPort = process.env.E2E_LIVE_AI_PORT ?? '55465';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function requireExplicitConfirmation() {
  if (process.env.CONFIRM_LIVE_AI_SMOKE !== 'run') {
    throw new Error(
      'Live AI smoke is disabled. Set CONFIRM_LIVE_AI_SMOKE=run explicitly before it may call OpenAI.',
    );
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('Live AI smoke requires OPENAI_API_KEY from approved secret storage.');
  }
}

function assertPorts() {
  for (const [name, value] of [
    ['LIVE_AI_SMOKE_DATABASE_PORT', databasePort],
    ['E2E_LIVE_AI_PORT', browserPort],
  ]) {
    if (!/^\d{2,5}$/.test(value) || Number(value) > 65535) {
      throw new Error(`${name} must be a valid local TCP port.`);
    }
  }
  if (databasePort === browserPort) {
    throw new Error('LIVE_AI_SMOKE_DATABASE_PORT and E2E_LIVE_AI_PORT must differ.');
  }
}

function runtimeEnvironment() {
  return {
    ...process.env,
    APP_URL: `http://127.0.0.1:${browserPort}`,
    DATABASE_URL: `postgresql://ams_content_factory_drill:migration_drill_only@127.0.0.1:${databasePort}/ams_content_factory_drill?schema=public`,
    E2E_LIVE_AI_PORT: browserPort,
    NODE_ENV: 'development',
    BETTER_AUTH_SECRET: 'live-ai-smoke-only-auth-secret-with-at-least-32-characters',
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString('base64'),
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
  requireExplicitConfirmation();
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
        'tests/playwright.live-ai.config.ts',
        'tests/e2e/v01-live-ai-provider.spec.ts',
      ],
      environment,
    );
    process.stdout.write(
      'Live AI smoke succeeded: one explicit browser generation reached OpenAI and persisted a scoped DRAFT/version/execution in a disposable pgvector database. No production system was changed.\n',
    );
  } finally {
    await run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], composeEnvironment);
  }
}

main().catch((error) => {
  process.stderr.write(
    `Live AI smoke failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
