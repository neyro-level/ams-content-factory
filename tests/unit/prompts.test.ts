import { getPrompt, promptKeys, PromptNotFoundError } from '../../packages/core/src/index.js';
import { describe, expect, it } from 'vitest';

describe('prompt catalogue', () => {
  it('contains exactly the version-one prompt keys approved by the implementation plan', () => {
    expect(promptKeys).toEqual([
      'research-summary',
      'content-brief',
      'social-post',
      'reel-script',
      'vk-adaptation',
      'instagram-adaptation',
      'fact-check',
      'rewrite',
    ]);
    expect(promptKeys.map((key) => getPrompt(key))).toEqual(
      expect.arrayContaining([expect.objectContaining({ version: 1 })]),
    );
  });

  it('does not silently select a different prompt for an unknown operation', () => {
    expect(() => getPrompt('unapproved-operation')).toThrow(PromptNotFoundError);
  });
});
