import { createHash } from 'node:crypto';

export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingProvider {
  embed(input: string): Promise<number[]>;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  async embed(input: string) {
    const values = new Array<number>(EMBEDDING_DIMENSIONS);
    for (let index = 0; index < EMBEDDING_DIMENSIONS; index += 1) {
      const digest = createHash('sha256').update(`${index}\0${input}`, 'utf8').digest();
      values[index] = digest.readUInt16BE(0) / 32_767.5 - 1;
    }
    return normalizeVector(values);
  }
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = 'text-embedding-3-small',
  ) {}

  async embed(input: string) {
    if (!this.apiKey) {
      throw new Error('BLOCKED_EXTERNAL: OPENAI_API_KEY is required for OpenAI embeddings.');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, model: this.model, dimensions: EMBEDDING_DIMENSIONS }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI embedding request failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    if (
      !embedding ||
      embedding.length !== EMBEDDING_DIMENSIONS ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('OpenAI embedding response has an invalid vector dimension.');
    }
    return embedding;
  }
}

export function assertEmbeddingDimensions(vector: number[]) {
  if (vector.length !== EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`Embedding must contain ${EMBEDDING_DIMENSIONS} finite dimensions.`);
  }
}

function normalizeVector(values: number[]) {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / magnitude);
}
