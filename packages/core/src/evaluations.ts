import {
  createEvaluationsRepository,
  type EvaluationRunStatus,
  type PrismaClient,
} from '@ams-content-factory/db';

export const initialEvaluationSuites = [
  ['content-quality', 'Content quality'],
  ['brand-voice', 'Brand voice'],
  ['factuality', 'Factuality'],
  ['research-quality', 'Research quality'],
  ['storyboard-quality', 'Storyboard quality'],
] as const;

const transitions: Record<EvaluationRunStatus, EvaluationRunStatus[]> = {
  PENDING: ['RUNNING'],
  RUNNING: ['PASSED', 'FAILED'],
  PASSED: [],
  FAILED: [],
};

export async function seedInitialEvaluationSuites(prisma?: PrismaClient) {
  const repository = createEvaluationsRepository(prisma);
  return Promise.all(
    initialEvaluationSuites.map(([key, name]) => repository.upsertSuite({ key, name })),
  );
}

export function createEvaluationService(options: { prisma?: PrismaClient } = {}) {
  const repository = createEvaluationsRepository(options.prisma);
  return {
    createCase: repository.createCase,
    async startRun(input: {
      suiteId: string;
      oldPromptKey?: string;
      oldPromptVersion?: number;
      newPromptKey?: string;
      newPromptVersion?: number;
    }) {
      if (!transitions.PENDING.includes('RUNNING'))
        throw new Error('Evaluation run transition is unavailable.');
      const run = await repository.createRun(input);
      const updated = await repository.transitionRun({
        id: run.id,
        from: 'PENDING',
        to: 'RUNNING',
      });
      if (updated.count !== 1) throw new Error('Evaluation run could not start.');
      return run;
    },
    async recordResult(input: {
      runId: string;
      caseId: string;
      passed: boolean;
      score?: number;
      output?: object;
      failures?: object;
    }) {
      const run = await repository.findRun(input.runId);
      if (!run || run.status !== 'RUNNING') throw new Error('Evaluation run is not active.');
      return repository.createResult(input);
    },
    async finishRun(id: string) {
      const run = await repository.findRun(id);
      if (!run || run.status !== 'RUNNING') throw new Error('Evaluation run is not active.');
      const cases = await repository.listCases(run.suiteId);
      if (run.results.length !== cases.length)
        throw new Error('Every evaluation case requires a result.');
      const status: EvaluationRunStatus = run.results.every((result) => result.passed)
        ? 'PASSED'
        : 'FAILED';
      if (!transitions.RUNNING.includes(status))
        throw new Error('Evaluation run transition is unavailable.');
      const updated = await repository.transitionRun({ id, from: 'RUNNING', to: status });
      if (updated.count !== 1) throw new Error('Evaluation run could not finish.');
      return repository.findRun(id);
    },
  };
}
