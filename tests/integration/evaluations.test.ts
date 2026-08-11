import 'dotenv/config';
import {
  createEvaluationService,
  initialEvaluationSuites,
  seedInitialEvaluationSuites,
} from '../../packages/core/src/index.js';
import { createPrismaClient } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();

afterAll(async () => {
  await prisma.evaluationSuite.deleteMany({
    where: { key: { in: initialEvaluationSuites.map(([key]) => key) } },
  });
  await prisma.$disconnect();
});

describe('AI evaluation subsystem', () => {
  it('seeds suites and requires a result for every regression case', async () => {
    const suites = await seedInitialEvaluationSuites(prisma);
    expect(suites.map((suite) => suite.key).sort()).toEqual(
      initialEvaluationSuites.map(([key]) => key).sort(),
    );
    const service = createEvaluationService({ prisma });
    const suite = suites.find((item) => item.key === 'content-quality')!;
    const first = await service.createCase({
      suiteId: suite.id,
      name: 'contains-benefit',
      input: { draft: 'Useful content' },
      expectedProperties: { contains: ['benefit'] },
      forbiddenProperties: { contains: ['guaranteed outcome'] },
      tags: ['regression'],
    });
    const second = await service.createCase({
      suiteId: suite.id,
      name: 'no-forbidden-claim',
      input: { draft: 'Draft' },
      expectedProperties: {},
      forbiddenProperties: { contains: ['guaranteed outcome'] },
    });
    const run = await service.startRun({
      suiteId: suite.id,
      oldPromptKey: 'content.draft',
      oldPromptVersion: 1,
      newPromptKey: 'content.draft',
      newPromptVersion: 2,
    });
    await service.recordResult({
      runId: run.id,
      caseId: first.id,
      passed: true,
      score: 1,
      output: { draft: 'Benefit' },
    });
    await expect(service.finishRun(run.id)).rejects.toThrow(
      'Every evaluation case requires a result',
    );
    await service.recordResult({
      runId: run.id,
      caseId: second.id,
      passed: false,
      failures: { forbidden: ['guaranteed outcome'] },
    });
    await expect(service.finishRun(run.id)).resolves.toEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
});
