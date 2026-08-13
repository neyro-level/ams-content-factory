import { getPrisma } from '../client';
import {
  AiExecutionStatus,
  ContentProjectStatus,
  ContentVersionAuthorType,
  type PrismaClient,
} from '../generated/prisma/client';

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
        idempotencyKey?: string;
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
          ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
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
    /**
     * Claims one initial-generation execution without holding a transaction across a provider call.
     * The unique key is the durable concurrency boundary, not a browser-side disabled button.
     */
    async claimInitialGeneration(
      input: AiExecutionScope & {
        provider: string;
        model: string;
        operation: string;
        promptKey: string;
        promptVersion: number;
        idempotencyKey: string;
      },
    ) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.aiExecution.findUnique({
          where: {
            contentProjectId_idempotencyKey: {
              contentProjectId: input.contentProjectId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { contentProject: { select: { organizationId: true, brandId: true } } },
        });
        if (existing) {
          if (
            existing.organizationId !== input.organizationId ||
            existing.brandId !== input.brandId ||
            existing.contentProject.organizationId !== input.organizationId ||
            existing.contentProject.brandId !== input.brandId
          )
            return { kind: 'missing' as const };
          if (existing.status === AiExecutionStatus.SUCCEEDED) {
            const version = await tx.contentVersion.findFirst({
              where: { contentProjectId: input.contentProjectId, aiExecutionId: existing.id },
            });
            return { kind: 'completed' as const, execution: existing, version };
          }
          if (
            existing.status === AiExecutionStatus.PENDING ||
            existing.status === AiExecutionStatus.RUNNING
          )
            return { kind: 'in_progress' as const, execution: existing };

          const retried = await tx.aiExecution.update({
            where: { id: existing.id },
            data: {
              status: AiExecutionStatus.PENDING,
              startedAt: null,
              finishedAt: null,
              errorCode: null,
              errorMessage: null,
            },
          });
          await tx.contentProject.updateMany({
            where: {
              id: input.contentProjectId,
              organizationId: input.organizationId,
              brandId: input.brandId,
              status: ContentProjectStatus.FAILED,
            },
            data: { status: ContentProjectStatus.RESEARCHING },
          });
          return { kind: 'claimed' as const, execution: retried };
        }

        // Only IDEA and FAILED can start a new operation.  RESEARCHING is kept
        // for a legacy project that has no execution yet; the upsert below
        // makes that recovery safe even when two callers see it together.
        const started = await tx.contentProject.updateMany({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
            status: {
              in: [ContentProjectStatus.IDEA, ContentProjectStatus.FAILED],
            },
          },
          data: { status: ContentProjectStatus.RESEARCHING },
        });
        if (started.count !== 1) {
          const project = await tx.contentProject.findFirst({
            where: {
              id: input.contentProjectId,
              organizationId: input.organizationId,
              brandId: input.brandId,
            },
            select: { status: true },
          });
          if (!project) return { kind: 'missing' as const };
          if (project.status !== ContentProjectStatus.RESEARCHING)
            return { kind: 'in_progress' as const };
        }
        const execution = await tx.aiExecution.upsert({
          where: {
            contentProjectId_idempotencyKey: {
              contentProjectId: input.contentProjectId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          create: {
            organizationId: input.organizationId,
            brandId: input.brandId,
            contentProjectId: input.contentProjectId,
            provider: input.provider,
            model: input.model,
            operation: input.operation,
            idempotencyKey: input.idempotencyKey,
            promptKey: input.promptKey,
            promptVersion: input.promptVersion,
          },
          update: {},
        });
        if (started.count !== 1) {
          if (execution.status === AiExecutionStatus.SUCCEEDED) {
            const version = await tx.contentVersion.findFirst({
              where: { contentProjectId: input.contentProjectId, aiExecutionId: execution.id },
            });
            return { kind: 'completed' as const, execution, version };
          }
          return { kind: 'in_progress' as const, execution };
        }
        return { kind: 'claimed' as const, execution };
      });
    },
    async completeGeneration(
      input: AiExecutionScope & {
        id: string;
        body: string;
        inputTokens?: number;
        outputTokens?: number;
        actualCost?: number;
      },
    ) {
      return prisma.$transaction(async (tx) => {
        const execution = await tx.aiExecution.findFirst({
          where: { ...scopeForUpdate(input), status: AiExecutionStatus.RUNNING },
          select: { id: true },
        });
        if (!execution) return null;
        const project = await tx.contentProject.updateMany({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
            status: ContentProjectStatus.RESEARCHING,
          },
          data: { nextVersion: { increment: 1 } },
        });
        if (project.count !== 1) return null;
        const allocated = await tx.contentProject.findUnique({
          where: { id: input.contentProjectId },
          select: { nextVersion: true },
        });
        if (!allocated) return null;
        const version = await tx.contentVersion.create({
          data: {
            contentProjectId: input.contentProjectId,
            version: allocated.nextVersion - 1,
            createdByType: ContentVersionAuthorType.AI,
            aiExecutionId: input.id,
            body: input.body,
          },
        });
        const succeeded = await tx.aiExecution.updateMany({
          where: { ...scopeForUpdate(input), status: AiExecutionStatus.RUNNING },
          data: {
            status: AiExecutionStatus.SUCCEEDED,
            finishedAt: new Date(),
            ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
            ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
            ...(input.actualCost === undefined ? {} : { actualCost: input.actualCost }),
          },
        });
        if (succeeded.count !== 1) throw new Error('AI execution success could not be persisted.');
        const drafted = await tx.contentProject.updateMany({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
            status: ContentProjectStatus.RESEARCHING,
          },
          data: { status: ContentProjectStatus.DRAFT },
        });
        if (drafted.count !== 1) throw new Error('Generated content could not enter DRAFT.');
        return version;
      });
    },
    async failGeneration(
      input: AiExecutionScope & { id: string; errorCode: string; errorMessage: string },
    ) {
      await prisma.$transaction(async (tx) => {
        await tx.aiExecution.updateMany({
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
        await tx.contentProject.updateMany({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
            status: ContentProjectStatus.RESEARCHING,
          },
          data: { status: ContentProjectStatus.FAILED },
        });
      });
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
