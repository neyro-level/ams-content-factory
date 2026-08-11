import { createHash, randomUUID } from 'node:crypto';

export type PublishingPlatform = 'INSTAGRAM' | 'VK';
export type ProviderPublicationStatus = 'PUBLISHED' | 'NOT_FOUND' | 'OUTCOME_UNKNOWN';

export type PublishingCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

export type PublishInput = {
  idempotencyKey: string;
  externalAccountId: string;
  credentials: PublishingCredentials;
  text: string;
  mediaKeys: string[];
};

export type PublishResult = {
  status: 'PUBLISHED' | 'OUTCOME_UNKNOWN';
  providerOperation: string;
  providerJobId?: string;
  externalPostId?: string;
  permalink?: string;
  response?: object;
};

export type PublicationStatusResult = {
  status: ProviderPublicationStatus;
  externalPostId?: string;
  permalink?: string;
  response?: object;
};

export interface PublishingProvider {
  readonly platform: PublishingPlatform;
  publish(input: PublishInput): Promise<PublishResult>;
  getStatus(input: {
    providerOperation: string;
    providerJobId?: string;
  }): Promise<PublicationStatusResult>;
}

/**
 * The concrete SDK/API client is injected by the runtime integration layer. This keeps
 * provider credentials and provider-specific HTTP calls outside the application core.
 */
export interface PublishingProviderClient {
  publish(input: PublishInput): Promise<PublishResult>;
  getStatus(input: {
    providerOperation: string;
    providerJobId?: string;
  }): Promise<PublicationStatusResult>;
}

class ClientPublishingProvider implements PublishingProvider {
  public constructor(
    public readonly platform: PublishingPlatform,
    private readonly client: PublishingProviderClient,
  ) {}

  publish(input: PublishInput) {
    return this.client.publish(input);
  }

  getStatus(input: { providerOperation: string; providerJobId?: string }) {
    return this.client.getStatus(input);
  }
}

export class InstagramPublishingProvider extends ClientPublishingProvider {
  public constructor(client: PublishingProviderClient) {
    super('INSTAGRAM', client);
  }
}

export class VkPublishingProvider extends ClientPublishingProvider {
  public constructor(client: PublishingProviderClient) {
    super('VK', client);
  }
}

export class MockPublishingProvider implements PublishingProvider {
  public readonly platform: PublishingPlatform;
  private readonly publications = new Map<string, PublishResult>();

  public constructor(platform: PublishingPlatform = 'VK') {
    this.platform = platform;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const existing = this.publications.get(input.idempotencyKey);
    if (existing) return existing;
    if (!input.text.trim()) throw new Error('Publication text is required.');
    if (!input.credentials.accessToken) throw new Error('Publication access token is required.');
    const postId = randomUUID();
    const result: PublishResult = {
      status: 'PUBLISHED',
      providerOperation: `mock:${this.platform.toLowerCase()}:publish`,
      providerJobId: createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 20),
      externalPostId: postId,
      permalink: `https://mock.local/${this.platform.toLowerCase()}/${postId}`,
      response: { mediaCount: input.mediaKeys.length },
    };
    this.publications.set(input.idempotencyKey, result);
    return result;
  }

  async getStatus(input: { providerOperation: string; providerJobId?: string }) {
    const result = [...this.publications.values()].find(
      (publication) =>
        publication.providerOperation === input.providerOperation &&
        publication.providerJobId === input.providerJobId,
    );
    if (!result || result.status === 'OUTCOME_UNKNOWN') return { status: 'NOT_FOUND' as const };
    return {
      status: 'PUBLISHED' as const,
      ...(result.externalPostId !== undefined ? { externalPostId: result.externalPostId } : {}),
      ...(result.permalink !== undefined ? { permalink: result.permalink } : {}),
      ...(result.response !== undefined ? { response: result.response } : {}),
    };
  }
}
