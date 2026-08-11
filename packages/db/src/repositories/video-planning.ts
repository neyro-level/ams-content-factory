import { getPrisma } from '../client';
import type { PrismaClient, VisualJobType } from '../generated/prisma/client';

export function createVideoPlanningRepository(prisma: PrismaClient = getPrisma()) {
  return {
    upsertRecipe(input: {
      key: string;
      name: string;
      version: number;
      description: string;
      platforms: string[];
      aspectRatios: string[];
      durationConfig: object;
      stages: string[];
      scriptShape: object;
      visualJobs: string[];
      qcRules: string[];
      deliverables: string[];
    }) {
      return prisma.videoRecipe.upsert({
        where: { key_version: { key: input.key, version: input.version } },
        create: input,
        update: input,
      });
    },
    async createStoryboard(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      contentVersionId: string;
      videoRecipeId: string;
      beats: Array<{
        narration: string;
        visualJob: VisualJobType;
        visualInstruction: string;
        durationHint?: number;
      }>;
    }) {
      const project = await prisma.contentProject.findFirst({
        where: {
          id: input.contentProjectId,
          organizationId: input.organizationId,
          brandId: input.brandId,
          versions: { some: { id: input.contentVersionId } },
        },
        select: { id: true },
      });
      if (!project) return null;
      const latest = await prisma.storyboard.aggregate({
        where: { contentProjectId: input.contentProjectId },
        _max: { version: true },
      });
      return prisma.storyboard.create({
        data: {
          contentProjectId: input.contentProjectId,
          contentVersionId: input.contentVersionId,
          videoRecipeId: input.videoRecipeId,
          version: (latest._max.version ?? 0) + 1,
          beats: { create: input.beats.map((beat, ordinal) => ({ ...beat, ordinal })) },
        },
        include: { beats: { orderBy: { ordinal: 'asc' } } },
      });
    },
  };
}
