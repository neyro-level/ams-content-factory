import {
  VkAnalyticsProviderUnavailableError,
  VkAnalyticsRuntimeClient,
} from '../../packages/providers/src/index.js';
import { afterEach, describe, expect, it } from 'vitest';

const originalVersion = process.env.VK_API_VERSION;

afterEach(() => {
  if (originalVersion === undefined) delete process.env.VK_API_VERSION;
  else process.env.VK_API_VERSION = originalVersion;
});

function runtime(response: unknown, request?: { url?: string; body?: string }) {
  return new VkAnalyticsRuntimeClient({
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

const input = {
  externalAccountId: '-123',
  externalPostId: '-123_42',
  credentials: { accessToken: 'not-logged' },
  capturedAt: new Date('2026-08-13T12:00:00.000Z'),
};

describe('VK analytics runtime client', () => {
  it('collects available wall metrics without inventing unavailable metrics or disclosing a token', async () => {
    const request: { url?: string; body?: string } = {};
    const result = await runtime(
      {
        response: {
          items: [
            {
              id: 42,
              owner_id: -123,
              views: { count: 101 },
              likes: { count: 8 },
              comments: { count: 3 },
              reposts: { count: 2 },
            },
          ],
        },
      },
      request,
    ).fetchSnapshot(input);

    expect(result.metrics).toEqual({ views: 101, likes: 8, comments: 3, shares: 2 });
    expect(result.metrics).not.toHaveProperty('reach');
    expect(JSON.stringify(result)).not.toContain('not-logged');
    expect(request.url).toBe('https://vk.example.test/method/wall.getById');
    expect(request.body).toContain('posts=-123_42');
    expect(request.body).toContain('v=5.199');
  });

  it('fails closed for missing configuration, rejected API calls, invalid ids and a foreign post', async () => {
    delete process.env.VK_API_VERSION;
    expect(() => new VkAnalyticsRuntimeClient({ fetch: globalThis.fetch })).toThrow(
      VkAnalyticsProviderUnavailableError,
    );
    await expect(
      runtime({ error: { error_code: 15, error_msg: 'Access denied' } }).fetchSnapshot(input),
    ).rejects.toThrow('VK API rejected the analytics request');
    await expect(
      runtime({ response: { items: [] } }).fetchSnapshot({ ...input, externalPostId: '42' }),
    ).rejects.toThrow('<owner_id>_<post_id>');
    await expect(
      runtime({ response: { items: [] } }).fetchSnapshot({ ...input, externalPostId: '-124_42' }),
    ).rejects.toThrow('does not belong');
  });

  it('fails closed on timeout, a missing token, malformed provider response and missing post', async () => {
    const timeoutClient = new VkAnalyticsRuntimeClient({
      apiVersion: '5.199',
      timeoutMs: 1,
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    });
    await expect(timeoutClient.fetchSnapshot(input)).rejects.toThrow('timed out');
    await expect(
      runtime({ response: { items: [] } }).fetchSnapshot({
        ...input,
        credentials: { accessToken: '' },
      }),
    ).rejects.toThrow('access token is required');
    await expect(runtime({}).fetchSnapshot(input)).rejects.toThrow('did not contain a result');
    await expect(runtime({ response: { items: [] } }).fetchSnapshot(input)).rejects.toThrow(
      'was not found',
    );
  });
});
