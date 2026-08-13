import {
  InstagramAnalyticsProviderUnavailableError,
  InstagramAnalyticsRuntimeClient,
} from '../../packages/providers/src/index.js';
import { afterEach, describe, expect, it } from 'vitest';

const originalVersion = process.env.INSTAGRAM_GRAPH_API_VERSION;

afterEach(() => {
  if (originalVersion === undefined) delete process.env.INSTAGRAM_GRAPH_API_VERSION;
  else process.env.INSTAGRAM_GRAPH_API_VERSION = originalVersion;
});

const input = {
  externalAccountId: '123',
  externalPostId: '456',
  credentials: { accessToken: 'not-logged' },
  capturedAt: new Date('2026-08-13T12:00:00.000Z'),
};

function runtime(responses: unknown[], requests?: Array<{ url: string; method: string }>) {
  return new InstagramAnalyticsRuntimeClient({
    apiVersion: 'v22.0',
    endpoint: 'https://graph.example.test',
    fetch: async (url, init) => {
      requests?.push({ url, method: init.method ?? 'GET' });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    },
  });
}

describe('Instagram analytics runtime client', () => {
  it('normalizes direct media and documented insight metrics without disclosing a token', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const result = await runtime(
      [
        { id: '456', like_count: 8, comments_count: 3 },
        {
          data: [
            { name: 'impressions', values: [{ value: 101 }] },
            { name: 'reach', values: [{ value: 80 }] },
            { name: 'shares', values: [{ value: 2 }] },
            { name: 'saved', values: [{ value: 4 }] },
          ],
        },
      ],
      requests,
    ).fetchSnapshot(input);

    expect(result.metrics).toEqual({
      likes: 8,
      comments: 3,
      impressions: 101,
      reach: 80,
      shares: 2,
      saves: 4,
    });
    expect(JSON.stringify(result)).not.toContain('not-logged');
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toContain('/v22.0/456?');
    expect(requests[1]?.url).toContain('/v22.0/456/insights?');
    expect(requests[1]?.url).toContain('metric=impressions%2Creach%2Cshares%2Csaved');
  });

  it('fails closed for missing configuration, Graph rejection, invalid ids and an absent media object', async () => {
    delete process.env.INSTAGRAM_GRAPH_API_VERSION;
    expect(() => new InstagramAnalyticsRuntimeClient({ fetch: globalThis.fetch })).toThrow(
      InstagramAnalyticsProviderUnavailableError,
    );
    await expect(
      runtime([{ error: { code: 10, message: 'Permission denied' } }]).fetchSnapshot(input),
    ).rejects.toThrow('Instagram Graph API rejected the analytics request');
    await expect(
      runtime([]).fetchSnapshot({ ...input, externalAccountId: 'instagram-account' }),
    ).rejects.toThrow('external account id must be numeric');
    await expect(runtime([{ id: 'other' }]).fetchSnapshot(input)).rejects.toThrow('was not found');
  });

  it('fails closed on timeout, a missing token and an insights API failure', async () => {
    const timeoutClient = new InstagramAnalyticsRuntimeClient({
      apiVersion: 'v22.0',
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
      runtime([]).fetchSnapshot({ ...input, credentials: { accessToken: '' } }),
    ).rejects.toThrow('access token is required');
    await expect(
      runtime([{ id: '456' }, { error: { code: 4, message: 'Rate limited' } }]).fetchSnapshot(
        input,
      ),
    ).rejects.toThrow('Instagram Graph API rejected the analytics request');
  });
});
