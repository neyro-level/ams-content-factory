import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createPrismaClient } from '@ams-content-factory/db';
import { seedInitialEvaluationSuites } from './evaluations';
import { seedInitialVideoRecipes } from './video-planning';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const prisma = createPrismaClient();

try {
  const [recipes, suites] = await Promise.all([
    seedInitialVideoRecipes(prisma),
    seedInitialEvaluationSuites(prisma),
  ]);
  console.log(`Seeded ${recipes.length} video recipes and ${suites.length} evaluation suites.`);
} finally {
  await prisma.$disconnect();
}
