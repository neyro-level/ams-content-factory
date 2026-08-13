import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectName = 'ams-content-factory-backup-drill';
const databasePort = process.env.BACKUP_DRILL_PORT ?? '55442';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const drillEnvironment = {
  ...process.env,
  DATABASE_URL: `postgresql://ams_content_factory_drill:migration_drill_only@127.0.0.1:${databasePort}/ams_content_factory_drill?schema=public`,
  NODE_ENV: 'test',
};

function spawnOptions(command, environment = drillEnvironment, stdio = 'inherit') {
  return {
    cwd: rootDirectory,
    env: environment,
    shell: process.platform === 'win32' && command === pnpmCommand,
    stdio,
  };
}

function run(command, args, environment = drillEnvironment) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, spawnOptions(command, environment));
    child.once('error', rejectRun);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else
        rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolveCapture, rejectCapture) => {
    const child = spawn(
      command,
      args,
      spawnOptions(command, drillEnvironment, ['ignore', 'pipe', 'inherit']),
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', rejectCapture);
    child.once('exit', (code) => {
      if (code === 0) resolveCapture(output);
      else
        rejectCapture(
          new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`),
        );
    });
  });
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
        'ams_content_factory_drill',
      ],
      spawnOptions('docker', drillEnvironment, ['ignore', 'pipe', 'inherit']),
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

function assertPort() {
  if (!/^\d{2,5}$/.test(databasePort) || Number(databasePort) > 65535) {
    throw new Error('BACKUP_DRILL_PORT must be a valid local TCP port.');
  }
}

async function main() {
  assertPort();
  const compose = ['compose', '-p', projectName, '-f', 'docker-compose.migration-drill.yml'];
  const composeEnvironment = { ...process.env, MIGRATION_DRILL_PORT: databasePort };
  const container = `${projectName}-postgres-1`;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ams-content-factory-backup-drill-'));
  const dumpFile = join(temporaryDirectory, 'backup.dump');

  await run('docker', [...compose, 'up', '--detach', '--wait'], composeEnvironment);
  try {
    await run(pnpmCommand, ['prisma:deploy']);
    await run(pnpmCommand, ['db:seed']);
    await dumpToFile(container, dumpFile);
    if ((await stat(dumpFile)).size === 0)
      throw new Error('pg_dump created an empty custom-format archive.');
    await run('docker', ['cp', dumpFile, `${container}:/tmp/backup-drill.dump`]);
    const listing = await capture('docker', [
      'exec',
      container,
      'pg_restore',
      '--list',
      '/tmp/backup-drill.dump',
    ]);
    for (const requiredEntity of ['_prisma_migrations', 'video_recipe', 'evaluation_suite']) {
      if (!listing.includes(requiredEntity)) {
        throw new Error(`The logical backup does not contain expected entity ${requiredEntity}.`);
      }
    }
    process.stdout.write(
      'Backup drill succeeded: custom pg_dump archive is non-empty and pg_restore-readable.\n',
    );
  } finally {
    await run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], composeEnvironment);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `Backup drill failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
