import {
  HeyGenProviderUnavailableError,
  HeyGenRuntimeClient,
} from '../../packages/providers/src/index.js';
import { describe, expect, it } from 'vitest';

const input = {
  idempotencyKey: 'heygen-contract-1',
  script: 'A prepared script.',
  aspectRatio: '9:16',
  outputKey: 'private/output.mp4',
  model: 'avatar-v4',
};

describe('HeyGen runtime client', () => {
  it('fails closed without credentials and avatar configuration', async () => {
    const client = new HeyGenRuntimeClient({
      apiKey: undefined,
      avatarId: undefined,
      voiceId: undefined,
    });
    await expect(client.create(input)).rejects.toBeInstanceOf(HeyGenProviderUnavailableError);
  });

  it('maps the official create payload and status polling without exposing a download URL as storage', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFunction: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith('/v2/video/generate'))
        return new Response(JSON.stringify({ data: { video_id: 'video-123' } }), { status: 200 });
      return new Response(
        JSON.stringify({ data: { status: 'completed', video_url: 'https://temporary' } }),
        {
          status: 200,
        },
      );
    };
    const client = new HeyGenRuntimeClient({
      apiKey: 'test-key',
      avatarId: 'avatar-1',
      voiceId: 'voice-1',
      fetchFunction,
    });
    await expect(client.create(input)).resolves.toEqual({
      externalJobId: 'video-123',
      status: 'SUBMITTED',
    });
    await expect(client.getStatus('video-123')).resolves.toEqual({
      externalJobId: 'video-123',
      status: 'COMPLETED',
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.init?.headers).toEqual(
      expect.objectContaining({ 'x-api-key': 'test-key' }),
    );
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual(
      expect.objectContaining({
        video_inputs: [
          expect.objectContaining({
            character: expect.objectContaining({ avatar_id: 'avatar-1' }),
            voice: expect.objectContaining({ voice_id: 'voice-1', input_text: input.script }),
          }),
        ],
        dimension: { width: 1080, height: 1920 },
      }),
    );
    expect(requests[1]?.url).toContain('/v1/video_status.get?video_id=video-123');
  });
});
