import {
  VkPublishingProviderUnavailableError,
  VkPublishingRuntimeClient,
} from '../../packages/providers/src/index.js';
import { afterEach, describe, expect, it } from 'vitest';

const originalVersion = process.env.VK_API_VERSION;

afterEach(() => {
  if (originalVersion === undefined) delete process.env.VK_API_VERSION;
  else process.env.VK_API_VERSION = originalVersion;
});

function runtime(response: unknown, request?: { url?: string; body?: string }) {
  return new VkPublishingRuntimeClient({
    apiVersion: '5.199',
    endpoint: 'https://vk.example.test/method',
    fetch: async (url, init) => {
      if (request) {
        request.url = url;
        request.body = String(init.body);
      }
      return new Response(JSON.stringify(response), { status: 200 });
    },
  });
}

describe('VK publishing runtime client', () => {
  it('posts a text-only message with a VK guid and normalizes its result', async () => {
    const request: { url?: string; body?: string } = {};
    const client = runtime({ response: { post_id: 42 } }, request);

    const result = await client.publish({
      idempotencyKey: 'publication-42',
      externalAccountId: '-123',
      credentials: { accessToken: 'not-logged' },
      text: 'VK content',
      mediaKeys: [],
    });
    expect(result).toMatchObject({
      providerOperation: 'vk:wall.post',
      providerJobId: '-123_42',
      permalink: 'https://vk.com/wall-123_42',
    });
    expect(JSON.stringify(result)).not.toContain('not-logged');
    expect(request.url).toBe('https://vk.example.test/method/wall.post');
    expect(request.body).toContain('owner_id=-123');
    expect(request.body).toContain('guid=publication-42');
    expect(request.body).toContain('v=5.199');
  });

  it('fails closed for missing runtime configuration, unsupported media and API errors', async () => {
    delete process.env.VK_API_VERSION;
    expect(() => new VkPublishingRuntimeClient({ fetch: globalThis.fetch })).toThrow(
      VkPublishingProviderUnavailableError,
    );
    const client = runtime({ error: { error_code: 15, error_msg: 'Access denied' } });
    await expect(
      client.publish({
        idempotencyKey: 'blocked',
        externalAccountId: '-123',
        credentials: { accessToken: 'not-logged' },
        text: 'VK content',
        mediaKeys: [],
      }),
    ).rejects.toThrow('VK API rejected');
    await expect(
      runtime({ response: { post_id: 1 } }).publish({
        idempotencyKey: 'media-blocked',
        externalAccountId: '-123',
        credentials: { accessToken: 'not-logged' },
        text: 'VK content',
        mediaKeys: ['private/key.mp4'],
      }),
    ).rejects.toThrow('dedicated VK upload pipeline');
    await expect(
      runtime({ response: { post_id: 1 } }).publish({
        idempotencyKey: 'bad-owner',
        externalAccountId: 'vk-community-name',
        credentials: { accessToken: 'not-logged' },
        text: 'VK content',
        mediaKeys: [],
      }),
    ).rejects.toThrow('numeric wall owner id');
  });

  it('fails closed when the VK request is aborted by its timeout', async () => {
    const client = new VkPublishingRuntimeClient({
      apiVersion: '5.199',
      timeoutMs: 1,
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    });
    await expect(
      client.publish({
        idempotencyKey: 'timeout',
        externalAccountId: '-123',
        credentials: { accessToken: 'not-logged' },
        text: 'VK content',
        mediaKeys: [],
      }),
    ).rejects.toThrow('timed out');
  });

  it('reconciles known wall posts and treats malformed or absent records safely', async () => {
    await expect(
      runtime({ response: { items: [{ id: 42, owner_id: -123 }] } }).getStatus({
        providerOperation: 'vk:wall.post',
        providerJobId: '-123_42',
        credentials: { accessToken: 'not-logged' },
      }),
    ).resolves.toMatchObject({ status: 'PUBLISHED', externalPostId: '-123_42' });
    await expect(
      runtime({ response: { items: [] } }).getStatus({
        providerOperation: 'vk:wall.post',
        providerJobId: '-123_42',
        credentials: { accessToken: 'not-logged' },
      }),
    ).resolves.toEqual({ status: 'NOT_FOUND' });
    await expect(
      runtime({ response: {} }).getStatus({
        providerOperation: 'other',
        providerJobId: 'unknown',
        credentials: { accessToken: 'not-logged' },
      }),
    ).resolves.toEqual({ status: 'OUTCOME_UNKNOWN' });
  });
});
