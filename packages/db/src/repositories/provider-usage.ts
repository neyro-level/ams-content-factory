import { getPrisma } from '../client';
import type { PrismaClient } from '../generated/prisma/client';

export function createProviderUsageRepository(prisma: PrismaClient = getPrisma()) {
  const projectInScope = (input: {
    organizationId: string;
    brandId: string;
    contentProjectId: string;
  }) =>
    prisma.contentProject.findFirst({
      where: {
        id: input.contentProjectId,
        organizationId: input.organizationId,
        brandId: input.brandId,
      },
      select: { id: true },
    });

  return {
    createRate(input: {
      provider: string;
      operation: string;
      model: string;
      unit: string;
      unitCost: number;
      currency: string;
      effectiveAt?: Date;
    }) {
      return prisma.providerRate.create({
        data: {
          ...input,
          ...(input.effectiveAt !== undefined ? { effectiveAt: input.effectiveAt } : {}),
        },
      });
    },
    findActiveRate(input: { provider: string; operation: string; model: string; unit: string }) {
      return prisma.providerRate.findFirst({
        where: {
          provider: input.provider,
          operation: input.operation,
          model: input.model,
          unit: input.unit,
          effectiveAt: { lte: new Date() },
          disabledAt: null,
        },
        orderBy: { effectiveAt: 'desc' },
      });
    },
    async createUsage(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      provider: string;
      operation: string;
      model: string;
      unit: string;
      quantity: number;
      estimatedCost: number;
      currency: string;
    }) {
      if (!(await projectInScope(input))) return null;
      return prisma.providerUsage.create({ data: input });
    },
    findUsage(input: { organizationId: string; brandId: string; id: string }) {
      return prisma.providerUsage.findFirst({
        where: { id: input.id, organizationId: input.organizationId, brandId: input.brandId },
      });
    },
    updateUsage(input: {
      organizationId: string;
      brandId: string;
      id: string;
      actualCost?: number;
      externalJobId?: string;
    }) {
      return prisma.providerUsage.updateMany({
        where: { id: input.id, organizationId: input.organizationId, brandId: input.brandId },
        data: {
          ...(input.actualCost !== undefined ? { actualCost: input.actualCost } : {}),
          ...(input.externalJobId !== undefined ? { externalJobId: input.externalJobId } : {}),
        },
      });
    },
  };
}
