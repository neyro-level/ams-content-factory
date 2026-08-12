import {
  createVideoPlanningRepository,
  type PrismaClient,
  type VisualJobType,
} from '@ams-content-factory/db';
import { initialVideoRecipes } from './video-recipes';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };

export async function seedInitialVideoRecipes(prisma?: PrismaClient) {
  const repository = createVideoPlanningRepository(prisma);
  return Promise.all(initialVideoRecipes.map((recipe) => repository.upsertRecipe(recipe)));
}

export function createStoryboardService(options: { prisma?: PrismaClient } = {}) {
  const repository = createVideoPlanningRepository(options.prisma);
  return {
    create: (
      context: Context,
      input: {
        contentProjectId: string;
        contentVersionId: string;
        videoRecipeId: string;
        beats: Array<{
          narration: string;
          visualJob: VisualJobType;
          visualInstruction: string;
          durationHint?: number;
        }>;
      },
    ) => {
      requirePermission(context, 'content:write');
      if (!context.brandId) throw new AccessDeniedError('Storyboard requires a brand context.');
      return repository.createStoryboard({
        organizationId: context.organizationId,
        brandId: context.brandId,
        ...input,
      });
    },
  };
}
