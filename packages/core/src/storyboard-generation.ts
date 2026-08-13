import { createTenantRepository, createVideoPlanningRepository } from '@ams-content-factory/db';
import {
  OpenAiTextGenerationProvider,
  TextGenerationProviderUnavailableError,
  type TextGenerationProvider,
} from '@ams-content-factory/providers';
import { z } from 'zod';
import { requirePermission, resolveTenantContext } from './tenant-context';

type Actor = { userId: string; organizationId: string; brandId: string };

const visualJobSchema = z.enum(['PROOF', 'MECHANISM', 'CONSEQUENCE', 'ACTION', 'TRANSITION']);
const generationSchema = z.object({
  beats: z
    .array(
      z.object({
        narration: z.string().trim().min(1).max(2_000),
        visualJob: visualJobSchema,
        visualInstruction: z.string().trim().min(1).max(2_000),
        durationHint: z.number().int().positive().max(180),
      }),
    )
    .min(1)
    .max(30),
});

export class StoryboardGenerationBlockedExternalError extends Error {
  constructor() {
    super('BLOCKED_EXTERNAL: storyboard generation provider is not configured.');
    this.name = 'StoryboardGenerationBlockedExternalError';
  }
}

export function createStoryboardGenerationService(options: {
  provider: TextGenerationProvider;
  tenantRepository?: ReturnType<typeof createTenantRepository>;
  repository?: ReturnType<typeof createVideoPlanningRepository>;
}) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const repository = options.repository ?? createVideoPlanningRepository();

  return {
    async generate(
      actor: Actor,
      input: {
        contentProjectId: string;
        contentVersionId: string;
        videoRecipeId: string;
        model?: string;
      },
    ) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:write');
      const scope = { organizationId: context.organizationId, brandId: context.brandId! };
      const [source, recipe] = await Promise.all([
        repository.findApprovedStoryboardSource({ ...scope, ...input }),
        repository.findActiveRecipe(input.videoRecipeId),
      ]);
      if (!source || !recipe)
        throw new Error('Approved script or active video recipe is unavailable.');
      const version = source.versions[0];
      const script = [version?.hook, version?.body, version?.script, version?.cta]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n\n');
      if (!script) throw new Error('Approved content version does not contain a script.');

      let response: Awaited<ReturnType<TextGenerationProvider['generate']>>;
      try {
        response = await options.provider.generate({
          operation: 'storyboard-generation',
          ...(input.model === undefined ? {} : { model: input.model }),
          prompt: storyboardPrompt({ script, recipe }),
        });
      } catch (error) {
        if (error instanceof TextGenerationProviderUnavailableError)
          throw new StoryboardGenerationBlockedExternalError();
        throw error;
      }

      const generated = parseGeneratedStoryboard(response.text, recipe);
      const storyboard = await repository.createStoryboard({
        ...scope,
        contentProjectId: input.contentProjectId,
        contentVersionId: input.contentVersionId,
        videoRecipeId: input.videoRecipeId,
        beats: generated.beats,
      });
      if (!storyboard)
        throw new Error('Storyboard could not be persisted for the approved script.');
      return storyboard;
    },
  };
}

export function createProductionStoryboardGenerationService() {
  return createStoryboardGenerationService({ provider: new OpenAiTextGenerationProvider() });
}

function storyboardPrompt(input: {
  script: string;
  recipe: { key: string; durationConfig: unknown; visualJobs: unknown };
}) {
  return [
    'Generate a production storyboard from the approved script below.',
    'Return JSON only, with {"beats":[{"narration":"...","visualJob":"...","visualInstruction":"...","durationHint":number}]}.',
    `Recipe: ${input.recipe.key}`,
    `Duration configuration: ${JSON.stringify(input.recipe.durationConfig)}`,
    `Allowed visual jobs: ${JSON.stringify(input.recipe.visualJobs)}`,
    '<approved-script>',
    input.script,
    '</approved-script>',
  ].join('\n');
}

function parseGeneratedStoryboard(
  text: string,
  recipe: { durationConfig: unknown; visualJobs: unknown },
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Storyboard generation returned invalid JSON.');
  }
  const storyboard = generationSchema.parse(parsed);
  const allowedJobs = new Set(
    Array.isArray(recipe.visualJobs)
      ? recipe.visualJobs.filter(
          (value): value is z.infer<typeof visualJobSchema> =>
            visualJobSchema.safeParse(value).success,
        )
      : [],
  );
  if (storyboard.beats.some((beat) => !allowedJobs.has(beat.visualJob)))
    throw new Error('Storyboard contains a visual job forbidden by the selected video recipe.');
  const duration = durationRange(recipe.durationConfig);
  const total = storyboard.beats.reduce((sum, beat) => sum + beat.durationHint, 0);
  if (!duration || total < duration.minSeconds || total > duration.maxSeconds)
    throw new Error('Storyboard duration is outside the selected video recipe range.');
  return storyboard;
}

function durationRange(value: unknown) {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const minSeconds = candidate?.minSeconds;
  const maxSeconds = candidate?.maxSeconds;
  return typeof minSeconds === 'number' && typeof maxSeconds === 'number'
    ? { minSeconds, maxSeconds }
    : null;
}
