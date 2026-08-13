import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectName = 'ams-content-factory-restore-drill';
const sourcePort = process.env.RESTORE_DRILL_SOURCE_PORT ?? '55452';
const targetPort = process.env.RESTORE_DRILL_TARGET_PORT ?? '55453';
const webPort = process.env.RESTORE_DRILL_WEB_PORT ?? '55454';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const sourceUrl = `postgresql://ams_content_factory_drill:restore_drill_only@127.0.0.1:${sourcePort}/ams_content_factory_source?schema=public`;
const targetUrl = `postgresql://ams_content_factory_drill:restore_drill_only@127.0.0.1:${targetPort}/ams_content_factory_target?schema=public`;

function environment(databaseUrl, nodeEnvironment = 'test') {
  return { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: nodeEnvironment };
}

function spawnOptions(command, executionEnvironment, stdio = 'inherit') {
  return {
    cwd: rootDirectory,
    env: executionEnvironment,
    shell: process.platform === 'win32' && command === pnpmCommand,
    stdio,
  };
}

function run(command, args, executionEnvironment) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, spawnOptions(command, executionEnvironment));
    child.once('error', rejectRun);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else
        rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function startWeb(executionEnvironment) {
  return spawn(
    process.execPath,
    ['apps/web/.next/standalone/apps/web/server.js'],
    spawnOptions(process.execPath, executionEnvironment),
  );
}

function dumpToFile(container, destination) {
  return new Promise((resolveDump, rejectDump) => {
    const child = spawn(
      'docker',
      [
        'exec',
        container,
        'pg_dump',
        '--format=custom',
        '--no-owner',
        '--username=ams_content_factory_drill',
        'ams_content_factory_source',
      ],
      spawnOptions('docker', environment(sourceUrl), ['ignore', 'pipe', 'inherit']),
    );
    const stream = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    child.stdout.pipe(stream);
    child.once('error', rejectDump);
    stream.once('error', rejectDump);
    let dumpExited = false;
    let streamFinished = false;
    const finish = () => {
      if (dumpExited && streamFinished) resolveDump();
    };
    child.once('exit', (code) => {
      if (code !== 0) rejectDump(new Error(`pg_dump exited with code ${code ?? 'unknown'}.`));
      else {
        dumpExited = true;
        finish();
      }
    });
    stream.once('finish', () => {
      streamFinished = true;
      finish();
    });
  });
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function waitForReady() {
  const target = `http://127.0.0.1:${webPort}/api/health/ready`;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = await fetch(target);
      if (response.status === 200 && (await response.json()).ok === true) return;
    } catch {
      // The standalone server is still starting; retry within the bounded deadline.
    }
    await wait(1000);
  }
  throw new Error(
    'The restored database did not reach application readiness before the drill deadline.',
  );
}

async function stopWeb(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    await run('taskkill', ['/pid', String(child.pid), '/t', '/f'], process.env);
    return;
  }
  child.kill('SIGTERM');
}

function assertPorts() {
  const ports = [
    ['RESTORE_DRILL_SOURCE_PORT', sourcePort],
    ['RESTORE_DRILL_TARGET_PORT', targetPort],
    ['RESTORE_DRILL_WEB_PORT', webPort],
  ];
  for (const [name, value] of ports) {
    if (!/^\d{2,5}$/.test(value) || Number(value) > 65535) {
      throw new Error(`${name} must be a valid local TCP port.`);
    }
  }
  if (new Set(ports.map(([, value]) => value)).size !== ports.length) {
    throw new Error('Restore drill source, target and web ports must differ.');
  }
}

async function main() {
  assertPorts();
  const compose = ['compose', '-p', projectName, '-f', 'docker-compose.restore-drill.yml'];
  const composeEnvironment = {
    ...process.env,
    RESTORE_DRILL_SOURCE_PORT: sourcePort,
    RESTORE_DRILL_TARGET_PORT: targetPort,
  };
  const sourceContainer = `${projectName}-source-1`;
  const targetContainer = `${projectName}-target-1`;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ams-content-factory-restore-drill-'));
  const dumpFile = join(temporaryDirectory, 'source.dump');
  let web;

  await run('docker', [...compose, 'up', '--detach', '--wait'], composeEnvironment);
  try {
    await run(pnpmCommand, ['prisma:deploy'], environment(sourceUrl));
    await run(pnpmCommand, ['db:seed'], environment(sourceUrl));
    await dumpToFile(sourceContainer, dumpFile);
    if ((await stat(dumpFile)).size === 0) throw new Error('The source backup archive is empty.');
    await run(
      'docker',
      ['cp', dumpFile, `${targetContainer}:/tmp/source.dump`],
      environment(targetUrl),
    );
    await run(
      'docker',
      [
        'exec',
        targetContainer,
        'pg_restore',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--username=ams_content_factory_drill',
        '--dbname=ams_content_factory_target',
        '/tmp/source.dump',
      ],
      environment(targetUrl),
    );
    const count = await new Promise((resolveCount, rejectCount) => {
      const child = spawn(
        'docker',
        [
          'exec',
          targetContainer,
          'psql',
          '--tuples-only',
          '--no-align',
          '--username=ams_content_factory_drill',
          '--dbname=ams_content_factory_target',
          '--command',
          'SELECT concat_ws(chr(58), (SELECT count(*) FROM "_prisma_migrations"), (SELECT count(*) FROM video_recipe), (SELECT count(*) FROM evaluation_suite));',
        ],
        spawnOptions('docker', environment(targetUrl), ['ignore', 'pipe', 'inherit']),
      );
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.once('error', rejectCount);
      child.once('exit', (code) => {
        if (code === 0) resolveCount(output.trim());
        else
          rejectCount(
            new Error(`Target entity verification exited with code ${code ?? 'unknown'}.`),
          );
      });
    });
    const [migrations, recipes, suites] = String(count).split(':').map(Number);
    if (!Number.isInteger(migrations) || migrations < 24 || recipes < 6 || suites < 5) {
      throw new Error(
        'Restored database does not contain the expected migration and seed entities.',
      );
    }
    const webEnvironment = {
      ...environment(targetUrl, 'production'),
      APP_URL: `http://127.0.0.1:${webPort}`,
      BETTER_AUTH_SECRET: 'restore-drill-only-auth-secret-with-at-least-32-characters',
      HOSTNAME: '127.0.0.1',
      PORT: webPort,
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'),
    };
    await run(pnpmCommand, ['--filter', '@ams-content-factory/web', 'build'], webEnvironment);
    web = startWeb(webEnvironment);
    await waitForReady();
    process.stdout.write(
      'Restore drill succeeded: backup, clean restore, critical entities and web readiness passed.\n',
    );
  } finally {
    await stopWeb(web);
    await run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], composeEnvironment);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `Restore drill failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
