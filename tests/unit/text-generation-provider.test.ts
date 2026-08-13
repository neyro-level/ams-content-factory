import {
  MockTextGenerationProvider,
  OpenAiTextGenerationProvider,
  TextGenerationProviderUnavailableError,
  type TextGenerationProvider,
} from '../../packages/providers/src/index.js';
import { describe, expect, it } from 'vitest';

describe('TextGenerationProvider', () => {
  it('keeps an application-facing generation request independent from an LLM SDK', async () => {
    const provider: TextGenerationProvider = new MockTextGenerationProvider({
      text: 'Generated draft.',
      model: 'test-model',
      usage: { inputTokens: 12, outputTokens: 4 },
    });

    await expect(
      provider.generate({ operation: 'social-post', prompt: 'Create a concise draft.' }),
    ).resolves.toEqual({
      text: 'Generated draft.',
      provider: 'mock-text-generation',
      model: 'test-model',
      usage: { inputTokens: 12, outputTokens: 4 },
    });
  });

  it('records the complete provider-neutral request only in the test double', async () => {
    const provider = new MockTextGenerationProvider();

    await provider.generate({
      operation: 'rewrite',
      prompt: 'Shorten this draft.',
      model: 'test-model',
    });

    expect(provider.requests).toEqual([
      { operation: 'rewrite', prompt: 'Shorten this draft.', model: 'test-model' },
    ]);
  });

  it('fails closed before making a live request when the OpenAI credential is absent', async () => {
    const provider = new OpenAiTextGenerationProvider(undefined, 'test-model', async () => {
      throw new Error('Network must not be called without a credential.');
    });

    await expect(
      provider.generate({ operation: 'social-post', prompt: 'Draft.' }),
    ).rejects.toBeInstanceOf(TextGenerationProviderUnavailableError);
  });

  it('maps a successful Responses API payload without retaining the request at the provider', async () => {
    let request: RequestInit | undefined;
    const provider = new OpenAiTextGenerationProvider(
      'test-key',
      'default-model',
      async (_url, init) => {
        request = init;
        return new Response(
          JSON.stringify({
            model: 'gpt-5-mini-2026-01-01',
            output: [
              {
                content: [
                  { type: 'output_text', text: 'Generated ' },
                  { type: 'output_text', text: 'draft.' },
                ],
              },
            ],
            usage: { input_tokens: 12, output_tokens: 4 },
          }),
        );
      },
    );

    await expect(
      provider.generate({ operation: 'social-post', prompt: 'Draft.' }),
    ).resolves.toEqual({
      text: 'Generated draft.',
      provider: 'openai',
      model: 'gpt-5-mini-2026-01-01',
      usage: { inputTokens: 12, outputTokens: 4 },
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      model: 'default-model',
      input: 'Draft.',
      store: false,
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not turn an upstream provider error into a text result', async () => {
    const provider = new OpenAiTextGenerationProvider(
      'test-key',
      'test-model',
      async () => new Response('provider unavailable', { status: 503 }),
    );

    await expect(provider.generate({ operation: 'social-post', prompt: 'Draft.' })).rejects.toThrow(
      'HTTP 503',
    );
  });
});
