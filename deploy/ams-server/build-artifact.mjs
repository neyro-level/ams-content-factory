import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

const releaseSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const image = process.env.ARTIFACT_IMAGE ?? 'ams-content-factory-artifact:local';
const testBuild = process.env.ALLOW_DIRTY_ARTIFACT_TEST === '1';
const workingTree = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });

if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
  throw new Error('Git HEAD must be a full lowercase SHA.');
}

if (!testBuild && workingTree) {
  throw new Error('Production artifact requires a clean working tree.');
}

if (!testBuild) {
  const sourceCraftMain = execFileSync('git', ['rev-parse', 'origin/main'], {
    encoding: 'utf8',
  }).trim();
  if (releaseSha !== sourceCraftMain) {
    throw new Error('Production artifact must be built from the exact origin/main commit.');
  }
}

const result = spawnSync(
  'docker',
  [
    'build',
    '--target',
    'artifact',
    '--build-arg',
    `RELEASE_SHA=${releaseSha}`,
    '--build-arg',
    `RELEASE_KIND=${testBuild ? 'test' : 'production'}`,
    '--file',
    'deploy/ams-server/Dockerfile',
    '--tag',
    image,
    '.',
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
