import { getPrisma } from '../client';
import type { EvaluationRunStatus, PrismaClient } from '../generated/prisma/client';

export function createEvaluationsRepository(prisma: PrismaClient = getPrisma()) {
  return {
    upsertSuite(input: { key: string; name: string }) {
      return prisma.evaluationSuite.upsert({
        where: { key: input.key },
        create: input,
        update: { name: input.name },
      });
    },
    createCase(input: {
      suiteId: string;
      name: string;
      input: object;
      expectedProperties: object;
      forbiddenProperties: object;
      referenceContext?: object;
      tags?: string[];
    }) {
      return prisma.evaluationCase.upsert({
        where: { suiteId_name: { suiteId: input.suiteId, name: input.name } },
        create: { ...input },
        update: {
          input: input.input,
          expectedProperties: input.expectedProperties,
          forbiddenProperties: input.forbiddenProperties,
          ...(input.referenceContext !== undefined
            ? { referenceContext: input.referenceContext }
            : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
        },
      });
    },
    createRun(input: {
      suiteId: string;
      oldPromptKey?: string;
      oldPromptVersion?: number;
      newPromptKey?: string;
      newPromptVersion?: number;
    }) {
      return prisma.evaluationRun.create({ data: input });
    },
    transitionRun(input: { id: string; from: EvaluationRunStatus; to: EvaluationRunStatus }) {
      return prisma.evaluationRun.updateMany({
        where: { id: input.id, status: input.from },
        data: {
          status: input.to,
          ...(input.to === 'RUNNING' ? { startedAt: new Date() } : {}),
          ...(input.to === 'PASSED' || input.to === 'FAILED' ? { finishedAt: new Date() } : {}),
        },
      });
    },
    listCases(suiteId: string) {
      return prisma.evaluationCase.findMany({ where: { suiteId }, orderBy: { name: 'asc' } });
    },
    createResult(input: {
      runId: string;
      caseId: string;
      passed: boolean;
      score?: number;
      output?: object;
      failures?: object;
    }) {
      return prisma.evaluationResult.upsert({
        where: { runId_caseId: { runId: input.runId, caseId: input.caseId } },
        create: input,
        update: {
          passed: input.passed,
          ...(input.score !== undefined ? { score: input.score } : {}),
          ...(input.output !== undefined ? { output: input.output } : {}),
          ...(input.failures !== undefined ? { failures: input.failures } : {}),
        },
      });
    },
    findRun(id: string) {
      return prisma.evaluationRun.findUnique({
        where: { id },
        include: { suite: true, results: true },
      });
    },
  };
}
