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
