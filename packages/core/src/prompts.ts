export const promptKeys = [
  'research-summary',
  'content-brief',
  'social-post',
  'reel-script',
  'vk-adaptation',
  'instagram-adaptation',
  'fact-check',
  'rewrite',
] as const;

export type PromptKey = (typeof promptKeys)[number];
export type PromptDefinition = { key: PromptKey; version: 1; instruction: string };

export class PromptNotFoundError extends Error {
  constructor(key: string) {
    super(`Unknown prompt key: ${key}`);
    this.name = 'PromptNotFoundError';
  }
}

const instruction =
  'Use only the supplied context. Do not add unsupported facts, sources, claims, or credentials.';

const catalogue: Record<PromptKey, PromptDefinition> = Object.fromEntries(
  promptKeys.map((key) => [key, Object.freeze({ key, version: 1, instruction })]),
) as Record<PromptKey, PromptDefinition>;

export function getPrompt(key: string): PromptDefinition {
  const prompt = catalogue[key as PromptKey];
  if (!prompt) throw new PromptNotFoundError(key);
  return prompt;
}
