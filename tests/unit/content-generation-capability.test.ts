import { afterEach, describe, expect, it } from 'vitest';
import { isTextGenerationAvailable } from '../../packages/core/src/index.js';

const capabilityKeys = ['OPENAI_API_KEY', 'E2E_TEST_TEXT_GENERATION', 'APP_URL'] as const;
const originalEnvironment = new Map(capabilityKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of capabilityKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('text generation product capability', () => {
  it('stays unavailable without a real credential outside the isolated E2E runtime', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.E2E_TEST_TEXT_GENERATION;
    delete process.env.APP_URL;

    expect(isTextGenerationAvailable()).toBe(false);
  });

  it('recognises a real credential without exposing it', () => {
    process.env.OPENAI_API_KEY = 'unit-test-key';
    delete process.env.E2E_TEST_TEXT_GENERATION;
    delete process.env.APP_URL;

    expect(isTextGenerationAvailable()).toBe(true);
  });

  it('permits the deterministic double only for the loopback E2E runtime', () => {
    delete process.env.OPENAI_API_KEY;
    process.env.E2E_TEST_TEXT_GENERATION = '1';
    process.env.APP_URL = 'https://example.test';
    expect(isTextGenerationAvailable()).toBe(false);

    process.env.APP_URL = 'http://127.0.0.1:3000';
    expect(isTextGenerationAvailable()).toBe(true);
  });
});
