import {
  createVideoPlanningRepository,
  type PrismaClient,
  type VisualJobType,
} from '@ams-content-factory/db';
import { initialVideoRecipes } from './video-recipes';

export async function seedInitialVideoRecipes(prisma?: PrismaClient) {
  const repository = createVideoPlanningRepository(prisma);
  return Promise.all(initialVideoRecipes.map((recipe) => repository.upsertRecipe(recipe)));
}

export function createStoryboardService(options: { prisma?: PrismaClient } = {}) {
  const repository = createVideoPlanningRepository(options.prisma);
  return {
    create: (input: {
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
    }) => repository.createStoryboard(input),
  };
}
