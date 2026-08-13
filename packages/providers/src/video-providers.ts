import { randomUUID } from 'node:crypto';

export type VideoProviderJobStatus =
  'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'OUTCOME_UNKNOWN';

export type VideoProviderCreateInput = {
  idempotencyKey: string;
  script: string;
  aspectRatio: string;
  outputKey: string;
  model: string;
};

export type VideoProviderJob = {
  externalJobId: string;
  status: VideoProviderJobStatus;
  outputKey?: string;
  actualCost?: number;
  errorCode?: string;
  errorMessage?: string;
};

export interface AvatarVideoProvider {
  create(input: VideoProviderCreateInput): Promise<VideoProviderJob>;
  getStatus(externalJobId: string): Promise<VideoProviderJob>;
  getResult(externalJobId: string): Promise<VideoProviderJob>;
}

export interface MotionVideoProvider {
  create(input: VideoProviderCreateInput): Promise<VideoProviderJob>;
  getStatus(externalJobId: string): Promise<VideoProviderJob>;
  getResult(externalJobId: string): Promise<VideoProviderJob>;
}

/**
 * HeyGen is invoked only through an official app/CLI-backed client supplied at runtime.
 * The domain never receives credentials or makes direct HTTP calls to provider endpoints.
 */
export interface HeyGenVideoAgentClient {
  create(input: VideoProviderCreateInput): Promise<VideoProviderJob>;
  getStatus(externalJobId: string): Promise<VideoProviderJob>;
  getResult(externalJobId: string): Promise<VideoProviderJob>;
}

type FetchFunction = typeof fetch;

export class HeyGenProviderUnavailableError extends Error {
  constructor() {
    super('BLOCKED_EXTERNAL: HEYGEN_API_KEY, HEYGEN_AVATAR_ID and HEYGEN_VOICE_ID are required.');
    this.name = 'HeyGenProviderUnavailableError';
  }
}

/** Official HeyGen V2 generation client; it owns credentials and never exposes them to core. */
export class HeyGenRuntimeClient implements HeyGenVideoAgentClient {
  public constructor(
    private readonly options: {
      apiKey?: string;
      avatarId?: string;
      voiceId?: string;
      baseUrl?: string;
      fetchFunction?: FetchFunction;
    } = {},
  ) {}

  async create(input: VideoProviderCreateInput): Promise<VideoProviderJob> {
    const config = this.config();
    const response = await config.fetchFunction(`${config.baseUrl}/v2/video/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
      body: JSON.stringify({
        title: `ams-${input.idempotencyKey}`,
        video_inputs: [
          {
            character: { type: 'avatar', avatar_id: config.avatarId, avatar_style: 'normal' },
            voice: { type: 'text', input_text: input.script, voice_id: config.voiceId },
          },
        ],
        dimension: dimensionFor(input.aspectRatio),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await payloadOf(response);
    if (!response.ok)
      throw new Error(`HeyGen video generation failed with HTTP ${response.status}.`);
    const externalJobId = stringAt(payload, ['data', 'video_id']);
    if (!externalJobId) throw new Error('HeyGen video generation response contains no video_id.');
    return { externalJobId, status: 'SUBMITTED' };
  }

  async getStatus(externalJobId: string) {
    const result = await this.retrieve(externalJobId);
    return result;
  }

  async getResult(externalJobId: string) {
    return this.retrieve(externalJobId);
  }

  private async retrieve(externalJobId: string): Promise<VideoProviderJob> {
    const config = this.config();
    const response = await config.fetchFunction(
      `${config.baseUrl}/v1/video_status.get?video_id=${encodeURIComponent(externalJobId)}`,
      { headers: { 'x-api-key': config.apiKey }, signal: AbortSignal.timeout(30_000) },
    );
    const payload = await payloadOf(response);
    if (!response.ok) throw new Error(`HeyGen video status failed with HTTP ${response.status}.`);
    const data = recordAt(payload, ['data']);
    const status = statusFor(typeof data?.status === 'string' ? data.status : '');
    return {
      externalJobId,
      status,
      ...(typeof data?.error === 'object' && data.error
        ? { errorMessage: JSON.stringify(data.error) }
        : {}),
    };
  }

  private config() {
    const apiKey = this.options.apiKey ?? process.env.HEYGEN_API_KEY;
    const avatarId = this.options.avatarId ?? process.env.HEYGEN_AVATAR_ID;
    const voiceId = this.options.voiceId ?? process.env.HEYGEN_VOICE_ID;
    if (!apiKey || !avatarId || !voiceId) throw new HeyGenProviderUnavailableError();
    return {
      apiKey,
      avatarId,
      voiceId,
      baseUrl: (this.options.baseUrl ?? 'https://api.heygen.com').replace(/\/$/, ''),
      fetchFunction: this.options.fetchFunction ?? fetch,
    };
  }
}

export class HeyGenProvider implements AvatarVideoProvider {
  public constructor(private readonly client: HeyGenVideoAgentClient) {}

  create(input: VideoProviderCreateInput) {
    return this.client.create(input);
  }

  getStatus(externalJobId: string) {
    return this.client.getStatus(externalJobId);
  }

  getResult(externalJobId: string) {
    return this.client.getResult(externalJobId);
  }
}

function dimensionFor(aspectRatio: string) {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '16:9') return { width: 1920, height: 1080 };
  throw new Error(`Unsupported HeyGen aspect ratio: ${aspectRatio}`);
}

function statusFor(status: string): VideoProviderJobStatus {
  if (['pending', 'waiting'].includes(status)) return 'SUBMITTED';
  if (status === 'processing') return 'PROCESSING';
  if (status === 'completed') return 'COMPLETED';
  if (status === 'failed') return 'FAILED';
  return 'OUTCOME_UNKNOWN';
}

async function payloadOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function recordAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
}

function stringAt(value: unknown, path: string[]) {
  const parent = recordAt(value, path.slice(0, -1));
  const leaf = path.at(-1);
  return leaf && typeof parent?.[leaf] === 'string' ? parent[leaf] : null;
}

export interface MotionProviderClient {
  create(input: VideoProviderCreateInput): Promise<VideoProviderJob>;
  getStatus(externalJobId: string): Promise<VideoProviderJob>;
  getResult(externalJobId: string): Promise<VideoProviderJob>;
}

export class MotionProvider implements MotionVideoProvider {
  public constructor(private readonly client: MotionProviderClient) {}

  create(input: VideoProviderCreateInput) {
    return this.client.create(input);
  }

  getStatus(externalJobId: string) {
    return this.client.getStatus(externalJobId);
  }

  getResult(externalJobId: string) {
    return this.client.getResult(externalJobId);
  }
}

class MockVideoProvider implements AvatarVideoProvider, MotionVideoProvider {
  private readonly jobs = new Map<string, VideoProviderJob>();
  private readonly idempotency = new Map<string, string>();

  async create(input: VideoProviderCreateInput): Promise<VideoProviderJob> {
    const existingId = this.idempotency.get(input.idempotencyKey);
    if (existingId) return this.jobs.get(existingId)!;
    if (!input.script.trim()) throw new Error('Video script is required.');
    const externalJobId = randomUUID();
    const job: VideoProviderJob = { externalJobId, status: 'SUBMITTED' };
    this.jobs.set(externalJobId, job);
    this.idempotency.set(input.idempotencyKey, externalJobId);
    return job;
  }

  async getStatus(externalJobId: string): Promise<VideoProviderJob> {
    const job = this.jobs.get(externalJobId);
    if (!job) return { externalJobId, status: 'OUTCOME_UNKNOWN' };
    if (job.status === 'SUBMITTED') {
      const processing = { ...job, status: 'PROCESSING' as const };
      this.jobs.set(externalJobId, processing);
      return processing;
    }
    if (job.status === 'PROCESSING') {
      const completed = {
        ...job,
        status: 'COMPLETED' as const,
        outputKey: `mock/${externalJobId}.mp4`,
        actualCost: 0,
      };
      this.jobs.set(externalJobId, completed);
      return completed;
    }
    return job;
  }

  async getResult(externalJobId: string): Promise<VideoProviderJob> {
    const job = await this.getStatus(externalJobId);
    return job.status === 'COMPLETED' ? job : { ...job, status: 'OUTCOME_UNKNOWN' };
  }
}

export class MockAvatarVideoProvider extends MockVideoProvider {}
export class MockMotionProvider extends MockVideoProvider {}
