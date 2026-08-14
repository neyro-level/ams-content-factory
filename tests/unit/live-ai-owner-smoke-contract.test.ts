import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

test('live AI owner smoke remains explicit, isolated and excluded from the ordinary CI gate', async () => {
  const [script, packageManifest, ci] = await Promise.all([
    readFile(resolve(root, 'scripts/live-ai-owner-smoke.mjs'), 'utf8'),
    readFile(resolve(root, 'package.json'), 'utf8'),
    readFile(resolve(root, '.sourcecraft/ci.yaml'), 'utf8'),
  ]);

  expect(script).toContain("process.env.CONFIRM_LIVE_AI_SMOKE !== 'run'");
  expect(script).toContain('process.env.OPENAI_API_KEY?.trim()');
  expect(script).toContain("const projectName = 'ams-content-factory-live-ai-smoke'");
  expect(script).toContain("'tests/playwright.live-ai.config.ts'");
  expect(script).toContain("'tests/e2e/v01-live-ai-provider.spec.ts'");
  expect(script).toContain("'down', '--volumes', '--remove-orphans'");
  expect(script).not.toContain('console.log(process.env.OPENAI_API_KEY');
  const liveBrowserContract = await readFile(
    resolve(root, 'tests/e2e/v01-live-ai-provider.spec.ts'),
    'utf8',
  );
  expect(liveBrowserContract).toContain("process.env.CONFIRM_LIVE_AI_SMOKE === 'run'");
  expect(liveBrowserContract).toContain('test.skip(');
  expect(JSON.parse(packageManifest).scripts['live:ai-owner-smoke']).toBe(
    'node scripts/live-ai-owner-smoke.mjs',
  );
  expect(ci).not.toContain('live:ai-owner-smoke');
  expect(ci).not.toContain('OPENAI_API_KEY');
});
