import {
  InstagramPublishingProviderUnavailableError,
  InstagramPublishingRuntimeClient,
} from '../../packages/providers/src/index.js';
import { afterEach, describe, expect, it } from 'vitest';

const originalVersion = process.env.INSTAGRAM_GRAPH_API_VERSION;

afterEach(() => {
  if (originalVersion === undefined) delete process.env.INSTAGRAM_GRAPH_API_VERSION;
  else process.env.INSTAGRAM_GRAPH_API_VERSION = originalVersion;
});

function runtime(responses: unknown[], requests: Array<{ url: string; body: string }>) {
  return new InstagramPublishingRuntimeClient({
    apiVersion: 'v22.0',
    endpoint: 'https://graph.example.test',
    fetch: async (url, init) => {
      requests.push({ url, body: String(init.body) });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    },
  });
}

const input = {
  idempotencyKey: 'ig-publication-1',
  externalAccountId: '123456789',
  credentials: { accessToken: 'not-logged' },
  text: 'Instagram content',
  mediaKeys: ['https://media.example.test/content.jpg'],
};

describe('Instagram publishing runtime client', () => {
  it('creates and publishes one public image container without leaking an OAuth token in the result', async () => {
    const requests: Array<{ url: string; body: string }> = [];
    const client = runtime([{ id: 'creation-1' }, { id: 'post-2' }], requests);

    const result = await client.publish(input);

    expect(result).toMatchObject({
      providerOperation: 'instagram:media_publish',
      providerJobId: 'post-2',
      response: { creationId: 'creation-1', postId: 'post-2' },
    });
    expect(JSON.stringify(result)).not.toContain('not-logged');
    expect(requests).toEqual([
      expect.objectContaining({ url: 'https://graph.example.test/v22.0/123456789/media' }),
      expect.objectContaining({ url: 'https://graph.example.test/v22.0/123456789/media_publish' }),
    ]);
    expect(requests[0]!.body).toContain('image_url=https%3A%2F%2Fmedia.example.test%2Fcontent.jpg');
    expect(requests[1]!.body).toContain('creation_id=creation-1');
  });

  it('fails closed for missing configuration, private URLs, invalid media shapes and Graph errors', async () => {
    delete process.env.INSTAGRAM_GRAPH_API_VERSION;
    expect(() => new InstagramPublishingRuntimeClient({ fetch: globalThis.fetch })).toThrow(
      InstagramPublishingProviderUnavailableError,
    );
    await expect(
      runtime([], []).publish({ ...input, mediaKeys: ['media/private-object.jpg'] }),
    ).rejects.toThrow('public HTTPS image URL');
    await expect(
      runtime([], []).publish({ ...input, mediaKeys: ['https://127.0.0.1/image.jpg'] }),
    ).rejects.toThrow('public HTTPS image URL');
    await expect(runtime([], []).publish({ ...input, mediaKeys: [] })).rejects.toThrow(
      'exactly one public image',
    );
    await expect(
      runtime([{ error: { code: 190, message: 'Invalid OAuth token' } }], []).publish(input),
    ).rejects.toThrow('Instagram Graph API rejected');
  });

  it('reconciles only with an OAuth credential and does not leak it in normalized output', async () => {
    const requests: Array<{ url: string; body: string }> = [];
    await expect(
      runtime(
        [{ id: 'post-2', permalink: 'https://instagram.example.test/p/post-2' }],
        requests,
      ).getStatus({
        providerOperation: 'instagram:media_publish',
        providerJobId: 'post-2',
        credentials: { accessToken: 'not-logged' },
      }),
    ).resolves.toMatchObject({ status: 'PUBLISHED', externalPostId: 'post-2' });
    expect(requests[0]!.url).toContain('/post-2?');
    expect(requests[0]!.body).toBe('undefined');
    await expect(
      runtime([], []).getStatus({
        providerOperation: 'instagram:media_publish',
        providerJobId: 'post-2',
        credentials: { accessToken: '' },
      }),
    ).rejects.toThrow('OAuth access token is required');
  });
});
