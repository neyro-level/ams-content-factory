import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectName = 'ams-content-factory-migration-drill';
const databasePort = process.env.MIGRATION_DRILL_PORT ?? '55432';
const webPort = process.env.MIGRATION_DRILL_WEB_PORT ?? '55433';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const drillEnvironment = {
  ...process.env,
  APP_URL: `http://127.0.0.1:${webPort}`,
  BETTER_AUTH_SECRET: 'migration-drill-only-auth-secret-with-at-least-32-characters',
  DATABASE_URL: `postgresql://ams_content_factory_drill:migration_drill_only@127.0.0.1:${databasePort}/ams_content_factory_drill?schema=public`,
  NODE_ENV: 'production',
  HOSTNAME: '127.0.0.1',
  PORT: webPort,
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
};

function run(command, args, environment = drillEnvironment) {
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

function start(command, args) {
  return spawn(command, args, {
    cwd: rootDirectory,
    env: drillEnvironment,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === pnpmCommand,
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForReady() {
  const target = `http://127.0.0.1:${webPort}/api/health/ready`;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = await fetch(target);
      if (response.status === 200 && (await response.json()).ok === true) return;
    } catch {
      // The server is still starting; retry with the bounded deadline below.
    }
    await delay(1000);
  }
  throw new Error(
    'The disposable web process did not become ready before the migration-drill deadline.',
  );
}

async function stopWeb(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    await run('taskkill', ['/pid', String(child.pid), '/t', '/f'], process.env);
    return;
  }
  child.kill('SIGTERM');
}

function assertPorts() {
  for (const [name, value] of [
    ['MIGRATION_DRILL_PORT', databasePort],
    ['MIGRATION_DRILL_WEB_PORT', webPort],
  ]) {
    if (!/^\d{2,5}$/.test(value) || Number(value) > 65535) {
      throw new Error(`${name} must be a valid local TCP port.`);
    }
  }
  if (databasePort === webPort) {
    throw new Error('MIGRATION_DRILL_PORT and MIGRATION_DRILL_WEB_PORT must differ.');
  }
}

async function main() {
  assertPorts();
  const compose = ['compose', '-p', projectName, '-f', 'docker-compose.migration-drill.yml'];
  await run('docker', [...compose, 'up', '--detach', '--wait'], process.env);

  let web;
  try {
    await run(pnpmCommand, ['prisma:deploy']);
    await run(pnpmCommand, ['db:seed']);
    await run(pnpmCommand, ['--filter', '@ams-content-factory/web', 'build']);
    web = start(process.execPath, ['apps/web/.next/standalone/apps/web/server.js']);
    await waitForReady();
    process.stdout.write(
      'Migration drill succeeded: migrate deploy, seed and web readiness passed.\n',
    );
  } finally {
    if (web) await stopWeb(web);
    await run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], process.env);
  }
}

main().catch((error) => {
  process.stderr.write(
    `Migration drill failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
