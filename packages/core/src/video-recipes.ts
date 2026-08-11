import { z } from 'zod';

export const videoRecipeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().min(1),
  platforms: z.array(z.string()).min(1),
  aspectRatios: z.array(z.string()).min(1),
  durationConfig: z
    .object({ minSeconds: z.number().positive(), maxSeconds: z.number().positive() })
    .refine((value) => value.maxSeconds >= value.minSeconds),
  stages: z.array(z.string()).min(1),
  scriptShape: z.object({ sections: z.array(z.string()).min(1) }),
  visualJobs: z.array(z.enum(['PROOF', 'MECHANISM', 'CONSEQUENCE', 'ACTION', 'TRANSITION'])).min(1),
  qcRules: z.array(z.string()).min(1),
  deliverables: z.array(z.string()).min(1),
});
export type VideoRecipeDefinition = z.infer<typeof videoRecipeSchema>;

const shared = {
  version: 1,
  platforms: ['Instagram', 'VK'],
  aspectRatios: ['9:16'],
  durationConfig: { minSeconds: 20, maxSeconds: 90 },
  stages: ['script', 'storyboard', 'production', 'qc'],
  scriptShape: { sections: ['hook', 'body', 'cta'] },
  visualJobs: ['PROOF', 'MECHANISM', 'ACTION'] as const,
  qcRules: ['captions', 'brand-fit', 'evidence'],
  deliverables: ['mp4', 'srt'],
};
export const initialVideoRecipes = [
  ['expert-avatar-reel', 'Expert avatar reel'],
  ['screen-proof-reel', 'Screen proof reel'],
  ['market-breakdown', 'Market breakdown'],
  ['case-breakdown', 'Case breakdown'],
  ['motion-explainer', 'Motion explainer'],
  ['captioned-talking-head', 'Captioned talking head'],
].map(([key, name]) =>
  videoRecipeSchema.parse({ ...shared, key, name, description: `Validated ${name} recipe.` }),
);

export function validateVideoRecipe(value: unknown): VideoRecipeDefinition {
  return videoRecipeSchema.parse(value);
}
