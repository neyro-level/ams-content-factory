import { getPrisma } from '../client';
import { AiExecutionStatus, type PrismaClient } from '../generated/prisma/client';

type AiExecutionScope = { organizationId: string; brandId: string; contentProjectId: string };

export function createAiExecutionRepository(prisma: PrismaClient = getPrisma()) {
  const projectInScope = (scope: AiExecutionScope) =>
    prisma.contentProject.findFirst({
      where: {
        id: scope.contentProjectId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
      },
      select: { id: true },
    });
  return {
    async create(
      input: AiExecutionScope & {
        provider: string;
        model: string;
        operation: string;
        promptKey: string;
        promptVersion: number;
        estimatedCost?: number;
        currency?: string;
      },
    ) {
      if (!(await projectInScope(input))) return null;
      return prisma.aiExecution.create({
        data: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          contentProjectId: input.contentProjectId,
          provider: input.provider,
          model: input.model,
          operation: input.operation,
          promptKey: input.promptKey,
          promptVersion: input.promptVersion,
          ...(input.estimatedCost === undefined ? {} : { estimatedCost: input.estimatedCost }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
        },
      });
    },
    markRunning(input: AiExecutionScope & { id: string }) {
      return prisma.aiExecution.updateMany({
        where: { ...input, status: AiExecutionStatus.PENDING },
        data: { status: AiExecutionStatus.RUNNING, startedAt: new Date() },
      });
    },
    markSucceeded(
      input: AiExecutionScope & {
        id: string;
        inputTokens?: number;
        outputTokens?: number;
        actualCost?: number;
      },
    ) {
      return prisma.aiExecution.updateMany({
        where: { ...scopeForUpdate(input), status: AiExecutionStatus.RUNNING },
        data: {
          status: AiExecutionStatus.SUCCEEDED,
          finishedAt: new Date(),
          ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
          ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
          ...(input.actualCost === undefined ? {} : { actualCost: input.actualCost }),
        },
      });
    },
    markFailed(input: AiExecutionScope & { id: string; errorCode: string; errorMessage: string }) {
      return prisma.aiExecution.updateMany({
        where: {
          ...scopeForUpdate(input),
          status: { in: [AiExecutionStatus.PENDING, AiExecutionStatus.RUNNING] },
        },
        data: {
          status: AiExecutionStatus.FAILED,
          finishedAt: new Date(),
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
        },
      });
    },
    find(input: AiExecutionScope & { id: string }) {
      return prisma.aiExecution.findFirst({ where: input });
    },
  };
}

function scopeForUpdate(input: AiExecutionScope & { id: string }) {
  return {
    id: input.id,
    organizationId: input.organizationId,
    brandId: input.brandId,
    contentProjectId: input.contentProjectId,
  };
}
