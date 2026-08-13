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

export type PublicationStatusInput = {
  providerOperation: string;
  providerJobId?: string;
  credentials: PublishingCredentials;
};

export interface PublishingProvider {
  readonly platform: PublishingPlatform;
  publish(input: PublishInput): Promise<PublishResult>;
  getStatus(input: PublicationStatusInput): Promise<PublicationStatusResult>;
}

/**
 * The concrete SDK/API client is injected by the runtime integration layer. This keeps
 * provider credentials and provider-specific HTTP calls outside the application core.
 */
export interface PublishingProviderClient {
  publish(input: PublishInput): Promise<PublishResult>;
  getStatus(input: PublicationStatusInput): Promise<PublicationStatusResult>;
}

class ClientPublishingProvider implements PublishingProvider {
  public constructor(
    public readonly platform: PublishingPlatform,
    private readonly client: PublishingProviderClient,
  ) {}

  publish(input: PublishInput) {
    return this.client.publish(input);
  }

  getStatus(input: PublicationStatusInput) {
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

export class VkPublishingProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VkPublishingProviderUnavailableError';
  }
}

type VkApiResponse<T> = { response?: T; error?: { error_code?: number; error_msg?: string } };
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function assertVkOwnerId(value: string) {
  if (!/^-?\d+$/.test(value)) {
    throw new VkPublishingProviderUnavailableError(
      'VK external account id must be a numeric wall owner id.',
    );
  }
  return value;
}

function vkApiError(payload: VkApiResponse<unknown>) {
  if (!payload.error) return undefined;
  const code =
    payload.error.error_code === undefined ? 'unknown' : String(payload.error.error_code);
  return new VkPublishingProviderUnavailableError(
    `VK API rejected the request (${code}): ${payload.error.error_msg ?? 'unknown error'}`,
  );
}

/**
 * Runtime VK API adapter. It uses an account OAuth token supplied by the encrypted
 * SocialCredential boundary; application code never receives an API version or HTTP shape.
 * Internal storage keys are intentionally not transformed into VK attachments here: their
 * upload lifecycle needs a dedicated VK media pipeline before a post may reference them.
 */
export class VkPublishingRuntimeClient implements PublishingProviderClient {
  private readonly fetch: FetchLike;
  private readonly endpoint: string;

  public constructor(
    options: { fetch?: FetchLike; endpoint?: string; apiVersion?: string; timeoutMs?: number } = {},
  ) {
    const apiVersion = options.apiVersion ?? process.env.VK_API_VERSION;
    if (!apiVersion) {
      throw new VkPublishingProviderUnavailableError(
        'VK_API_VERSION is required for VK publishing.',
      );
    }
    this.fetch = options.fetch ?? globalThis.fetch;
    this.endpoint = options.endpoint ?? 'https://api.vk.com/method';
    this.apiVersion = apiVersion;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private readonly apiVersion: string;
  private readonly timeoutMs: number;

  private async call<T>(method: string, parameters: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.endpoint}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ ...parameters, v: this.apiVersion }).toString(),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new VkPublishingProviderUnavailableError(`VK API HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as VkApiResponse<T>;
      const error = vkApiError(payload);
      if (error) throw error;
      if (payload.response === undefined) {
        throw new VkPublishingProviderUnavailableError('VK API response did not contain a result.');
      }
      return payload.response;
    } catch (error) {
      if (error instanceof VkPublishingProviderUnavailableError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new VkPublishingProviderUnavailableError('VK API request timed out.');
      }
      throw new VkPublishingProviderUnavailableError(
        'VK API request failed before a response was received.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!input.credentials.accessToken) {
      throw new VkPublishingProviderUnavailableError('VK OAuth access token is required.');
    }
    if (!input.text.trim()) {
      throw new VkPublishingProviderUnavailableError('VK publication text is required.');
    }
    if (input.mediaKeys.length) {
      throw new VkPublishingProviderUnavailableError(
        'VK media attachments require the dedicated VK upload pipeline before publishing.',
      );
    }
    const ownerId = assertVkOwnerId(input.externalAccountId);
    const result = await this.call<{ post_id?: number }>('wall.post', {
      owner_id: ownerId,
      message: input.text,
      guid: input.idempotencyKey,
      access_token: input.credentials.accessToken,
    });
    if (!Number.isInteger(result.post_id) || result.post_id! <= 0) {
      throw new VkPublishingProviderUnavailableError('VK API did not return a valid post id.');
    }
    const externalPostId = `${ownerId}_${result.post_id}`;
    return {
      status: 'PUBLISHED',
      providerOperation: 'vk:wall.post',
      providerJobId: externalPostId,
      externalPostId,
      permalink: `https://vk.com/wall${externalPostId}`,
      response: { postId: result.post_id, ownerId: Number(ownerId) },
    };
  }

  async getStatus(input: PublicationStatusInput) {
    if (input.providerOperation !== 'vk:wall.post' || !input.providerJobId) {
      return { status: 'OUTCOME_UNKNOWN' as const };
    }
    if (!input.credentials.accessToken) {
      throw new VkPublishingProviderUnavailableError(
        'VK OAuth access token is required for reconciliation.',
      );
    }
    const [ownerId, postId] = input.providerJobId.split('_');
    if (!ownerId || !postId || !/^-?\d+$/.test(ownerId) || !/^\d+$/.test(postId)) {
      return { status: 'OUTCOME_UNKNOWN' as const };
    }
    const result = await this.call<{ items?: Array<{ id?: number; owner_id?: number }> }>(
      'wall.getById',
      {
        posts: `${ownerId}_${postId}`,
        access_token: input.credentials.accessToken,
      },
    );
    const post = result.items?.[0];
    if (!post || post.id !== Number(postId) || post.owner_id !== Number(ownerId)) {
      return { status: 'NOT_FOUND' as const };
    }
    return {
      status: 'PUBLISHED' as const,
      externalPostId: input.providerJobId,
      permalink: `https://vk.com/wall${input.providerJobId}`,
      response: { postId: post.id, ownerId: post.owner_id },
    };
  }
}

export class InstagramPublishingProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstagramPublishingProviderUnavailableError';
  }
}

function assertPublicInstagramImageUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InstagramPublishingProviderUnavailableError(
      'Instagram publishing requires one valid public HTTPS image URL.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname === 'localhost' ||
    /^127\.|^0\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname) ||
    /^\[/.test(url.hostname)
  ) {
    throw new InstagramPublishingProviderUnavailableError(
      'Instagram publishing requires one valid public HTTPS image URL.',
    );
  }
  return url.toString();
}

type InstagramGraphResponse = { id?: string; error?: { code?: number; message?: string } };
type InstagramGraphStatusResponse = InstagramGraphResponse & { permalink?: string };

/**
 * Instagram Graph Content Publishing adapter for one public image post. The system
 * currently stores media in private S3, so this runtime intentionally rejects those
 * storage keys until a dedicated public delivery/upload boundary is implemented.
 */
export class InstagramPublishingRuntimeClient implements PublishingProviderClient {
  private readonly fetch: FetchLike;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;

  public constructor(
    options: { fetch?: FetchLike; endpoint?: string; apiVersion?: string; timeoutMs?: number } = {},
  ) {
    const apiVersion = options.apiVersion ?? process.env.INSTAGRAM_GRAPH_API_VERSION;
    if (!apiVersion) {
      throw new InstagramPublishingProviderUnavailableError(
        'INSTAGRAM_GRAPH_API_VERSION is required for Instagram publishing.',
      );
    }
    this.fetch = options.fetch ?? globalThis.fetch;
    this.endpoint = options.endpoint ?? 'https://graph.facebook.com';
    this.apiVersion = apiVersion;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async call(path: string, parameters: Record<string, string>): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.endpoint}/${this.apiVersion}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams(parameters).toString(),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new InstagramPublishingProviderUnavailableError(
          `Instagram Graph API HTTP ${response.status}.`,
        );
      }
      const payload = (await response.json()) as InstagramGraphResponse;
      if (payload.error) {
        throw new InstagramPublishingProviderUnavailableError(
          `Instagram Graph API rejected the request (${payload.error.code ?? 'unknown'}): ${payload.error.message ?? 'unknown error'}`,
        );
      }
      if (payload.id === undefined) {
        throw new InstagramPublishingProviderUnavailableError(
          'Instagram Graph API response did not contain an id.',
        );
      }
      return payload.id;
    } catch (error) {
      if (error instanceof InstagramPublishingProviderUnavailableError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new InstagramPublishingProviderUnavailableError(
          'Instagram Graph API request timed out.',
        );
      }
      throw new InstagramPublishingProviderUnavailableError(
        'Instagram Graph API request failed before a response was received.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async get(
    path: string,
    parameters: Record<string, string>,
  ): Promise<InstagramGraphStatusResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(
        `${this.endpoint}/${this.apiVersion}${path}?${new URLSearchParams(parameters).toString()}`,
        { method: 'GET', signal: controller.signal },
      );
      if (!response.ok) {
        throw new InstagramPublishingProviderUnavailableError(
          `Instagram Graph API HTTP ${response.status}.`,
        );
      }
      const payload = (await response.json()) as InstagramGraphStatusResponse;
      if (payload.error) {
        throw new InstagramPublishingProviderUnavailableError(
          `Instagram Graph API rejected the request (${payload.error.code ?? 'unknown'}): ${payload.error.message ?? 'unknown error'}`,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof InstagramPublishingProviderUnavailableError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new InstagramPublishingProviderUnavailableError(
          'Instagram Graph API request timed out.',
        );
      }
      throw new InstagramPublishingProviderUnavailableError(
        'Instagram Graph API request failed before a response was received.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!input.credentials.accessToken) {
      throw new InstagramPublishingProviderUnavailableError(
        'Instagram OAuth access token is required.',
      );
    }
    if (!/^\d+$/.test(input.externalAccountId)) {
      throw new InstagramPublishingProviderUnavailableError(
        'Instagram external account id must be a numeric Instagram user id.',
      );
    }
    if (input.mediaKeys.length !== 1) {
      throw new InstagramPublishingProviderUnavailableError(
        'Instagram publishing currently requires exactly one public image URL.',
      );
    }
    const imageUrl = assertPublicInstagramImageUrl(input.mediaKeys[0]!);
    const creationId = await this.call(`/${input.externalAccountId}/media`, {
      image_url: imageUrl,
      caption: input.text,
      access_token: input.credentials.accessToken,
    });
    const postId = await this.call(`/${input.externalAccountId}/media_publish`, {
      creation_id: creationId,
      access_token: input.credentials.accessToken,
    });
    return {
      status: 'PUBLISHED',
      providerOperation: 'instagram:media_publish',
      providerJobId: postId,
      externalPostId: postId,
      response: { creationId, postId },
    };
  }

  async getStatus(input: PublicationStatusInput): Promise<PublicationStatusResult> {
    if (input.providerOperation !== 'instagram:media_publish' || !input.providerJobId) {
      return { status: 'OUTCOME_UNKNOWN' as const };
    }
    if (!input.credentials.accessToken) {
      throw new InstagramPublishingProviderUnavailableError(
        'Instagram OAuth access token is required for reconciliation.',
      );
    }
    const status = await this.get(`/${input.providerJobId}`, {
      fields: 'id,permalink',
      access_token: input.credentials.accessToken,
    });
    if (status.id !== input.providerJobId) return { status: 'NOT_FOUND' as const };
    return {
      status: 'PUBLISHED' as const,
      externalPostId: status.id,
      ...(status.permalink !== undefined ? { permalink: status.permalink } : {}),
      response: { postId: status.id },
    };
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

  async getStatus(input: PublicationStatusInput) {
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

/** Explicit non-mock provider used when runtime setup is absent. */
export class PublishingProviderBlockedExternalError extends Error {
  constructor(platform: PublishingPlatform, reason: string) {
    super(`BLOCKED_EXTERNAL: ${platform} publishing is unavailable: ${reason}`);
    this.name = 'PublishingProviderBlockedExternalError';
  }
}

export class UnavailablePublishingProvider implements PublishingProvider {
  public constructor(
    public readonly platform: PublishingPlatform,
    private readonly reason: string,
  ) {}

  async publish(_input: PublishInput): Promise<PublishResult> {
    throw new PublishingProviderBlockedExternalError(this.platform, this.reason);
  }

  async getStatus(_input: PublicationStatusInput): Promise<PublicationStatusResult> {
    return { status: 'OUTCOME_UNKNOWN' };
  }
}
