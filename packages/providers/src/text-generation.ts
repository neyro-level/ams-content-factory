export type TextGenerationRequest = {
  operation: string;
  prompt: string;
  model?: string;
};

export type TextGenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type TextGenerationResult = {
  text: string;
  provider: string;
  model: string;
  usage?: TextGenerationUsage;
};

/**
 * Provider-neutral boundary for text generation. Application services depend
 * on this contract and never import an LLM SDK directly.
 */
export interface TextGenerationProvider {
  generate(input: TextGenerationRequest): Promise<TextGenerationResult>;
}

type FetchFunction = typeof fetch;

export class TextGenerationProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextGenerationProviderUnavailableError';
  }
}

export class OpenAiTextGenerationProvider implements TextGenerationProvider {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly defaultModel = 'gpt-5-mini',
    private readonly fetchFunction: FetchFunction = fetch,
  ) {}

  async generate(input: TextGenerationRequest): Promise<TextGenerationResult> {
    if (!this.apiKey) {
      throw new TextGenerationProviderUnavailableError(
        'BLOCKED_EXTERNAL: OPENAI_API_KEY is required for OpenAI text generation.',
      );
    }
    const response = await this.fetchFunction('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model ?? this.defaultModel,
        input: input.prompt,
        store: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`OpenAI text generation request failed with HTTP ${response.status}.`);
    }
    const payload = asRecord(await response.json());
    const text = outputText(payload.output);
    const model =
      typeof payload.model === 'string' ? payload.model : (input.model ?? this.defaultModel);
    const tokenUsage = usage(payload.usage);
    if (!text.trim()) throw new Error('OpenAI text generation response contains no output text.');
    return {
      text,
      provider: 'openai',
      model,
      ...(tokenUsage ? { usage: tokenUsage } : {}),
    };
  }
}

export class MockTextGenerationProvider implements TextGenerationProvider {
  readonly requests: TextGenerationRequest[] = [];

  constructor(
    private readonly result: Omit<TextGenerationResult, 'provider'> & { provider?: string } = {
      text: 'Mock text generation result.',
      model: 'mock-text-v1',
    },
  ) {}

  async generate(input: TextGenerationRequest): Promise<TextGenerationResult> {
    this.requests.push(input);
    return { ...this.result, provider: this.result.provider ?? 'mock-text-generation' };
  }
}

function outputText(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((message) => {
      const content = asRecord(message).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        const record = asRecord(part);
        return record.type === 'output_text' && typeof record.text === 'string'
          ? [record.text]
          : [];
      });
    })
    .join('');
}

function usage(value: unknown): TextGenerationUsage | undefined {
  const record = asRecord(value);
  const inputTokens = finiteNumber(record.input_tokens);
  const outputTokens = finiteNumber(record.output_tokens);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
