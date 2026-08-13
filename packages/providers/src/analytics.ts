import type { PublishingCredentials, PublishingPlatform } from './publishing';

export type NormalizedMetricValues = {
  views?: number;
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  watchTimeMs?: number;
  averageWatchTimeMs?: number;
  followersDelta?: number;
};

export type AnalyticsSnapshotResult = {
  rawMetrics: object;
  metrics: NormalizedMetricValues;
};

export interface AnalyticsProvider {
  readonly platform: PublishingPlatform;
  fetchSnapshot(input: {
    externalAccountId: string;
    externalPostId: string;
    credentials: PublishingCredentials;
    capturedAt: Date;
  }): Promise<AnalyticsSnapshotResult>;
}

/** Runtime integrations inject an official provider client; the core never calls platform HTTP APIs. */
export interface AnalyticsProviderClient {
  fetchSnapshot(input: {
    externalAccountId: string;
    externalPostId: string;
    credentials: PublishingCredentials;
    capturedAt: Date;
  }): Promise<AnalyticsSnapshotResult>;
}

class ClientAnalyticsProvider implements AnalyticsProvider {
  public constructor(
    public readonly platform: PublishingPlatform,
    private readonly client: AnalyticsProviderClient,
  ) {}

  fetchSnapshot(input: {
    externalAccountId: string;
    externalPostId: string;
    credentials: PublishingCredentials;
    capturedAt: Date;
  }) {
    return this.client.fetchSnapshot(input);
  }
}

export class InstagramAnalyticsProvider extends ClientAnalyticsProvider {
  public constructor(client: AnalyticsProviderClient) {
    super('INSTAGRAM', client);
  }
}

export class VkAnalyticsProvider extends ClientAnalyticsProvider {
  public constructor(client: AnalyticsProviderClient) {
    super('VK', client);
  }
}

export class VkAnalyticsProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VkAnalyticsProviderUnavailableError';
  }
}

type VkAnalyticsApiResponse<T> = {
  response?: T;
  error?: { error_code?: number; error_msg?: string };
};
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type VkWallPost = {
  id?: number;
  owner_id?: number;
  views?: { count?: number };
  likes?: { count?: number };
  comments?: { count?: number };
  reposts?: { count?: number };
};

function assertVkNumericId(value: string, label: string) {
  if (!/^-?\d+$/.test(value)) {
    throw new VkAnalyticsProviderUnavailableError(`VK ${label} must be numeric.`);
  }
  return value;
}

function parseVkWallPostId(externalAccountId: string, externalPostId: string) {
  const accountId = assertVkNumericId(externalAccountId, 'external account id');
  const [ownerId, postId, extra] = externalPostId.split('_');
  if (!ownerId || !postId || extra || !/^-?\d+$/.test(ownerId) || !/^\d+$/.test(postId)) {
    throw new VkAnalyticsProviderUnavailableError(
      'VK external post id must have the <owner_id>_<post_id> format.',
    );
  }
  if (ownerId !== accountId) {
    throw new VkAnalyticsProviderUnavailableError(
      'VK external post does not belong to the connected external account.',
    );
  }
  return { ownerId, postId };
}

function asVkMetric(value: number | undefined) {
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function vkAnalyticsApiError(payload: VkAnalyticsApiResponse<unknown>) {
  if (!payload.error) return undefined;
  const code =
    payload.error.error_code === undefined ? 'unknown' : String(payload.error.error_code);
  return new VkAnalyticsProviderUnavailableError(
    `VK API rejected the analytics request (${code}): ${payload.error.error_msg ?? 'unknown error'}`,
  );
}

/**
 * Read-only VK wall analytics adapter. VK's wall object exposes only metrics that
 * are actually present for a post; reach, clicks and saves are never invented.
 * The OAuth token enters this boundary only for the outbound request and is not
 * copied to rawMetrics or an error message.
 */
export class VkAnalyticsRuntimeClient implements AnalyticsProviderClient {
  private readonly fetch: FetchLike;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;

  public constructor(
    options: { fetch?: FetchLike; endpoint?: string; apiVersion?: string; timeoutMs?: number } = {},
  ) {
    const apiVersion = options.apiVersion ?? process.env.VK_API_VERSION;
    if (!apiVersion) {
      throw new VkAnalyticsProviderUnavailableError('VK_API_VERSION is required for VK analytics.');
    }
    this.fetch = options.fetch ?? globalThis.fetch;
    this.endpoint = options.endpoint ?? 'https://api.vk.com/method';
    this.apiVersion = apiVersion;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

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
        throw new VkAnalyticsProviderUnavailableError(`VK API HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as VkAnalyticsApiResponse<T>;
      const error = vkAnalyticsApiError(payload);
      if (error) throw error;
      if (payload.response === undefined) {
        throw new VkAnalyticsProviderUnavailableError(
          'VK API analytics response did not contain a result.',
        );
      }
      return payload.response;
    } catch (error) {
      if (error instanceof VkAnalyticsProviderUnavailableError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new VkAnalyticsProviderUnavailableError('VK analytics request timed out.');
      }
      throw new VkAnalyticsProviderUnavailableError(
        'VK analytics request failed before a response was received.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchSnapshot(input: {
    externalAccountId: string;
    externalPostId: string;
    credentials: PublishingCredentials;
    capturedAt: Date;
  }): Promise<AnalyticsSnapshotResult> {
    if (!input.credentials.accessToken) {
      throw new VkAnalyticsProviderUnavailableError(
        'VK OAuth access token is required for analytics.',
      );
    }
    const { ownerId, postId } = parseVkWallPostId(input.externalAccountId, input.externalPostId);
    const response = await this.call<{ items?: VkWallPost[] }>('wall.getById', {
      posts: `${ownerId}_${postId}`,
      access_token: input.credentials.accessToken,
    });
    const post = response.items?.[0];
    if (!post || post.id !== Number(postId) || post.owner_id !== Number(ownerId)) {
      throw new VkAnalyticsProviderUnavailableError('VK wall post was not found for analytics.');
    }
    const views = asVkMetric(post.views?.count);
    const likes = asVkMetric(post.likes?.count);
    const comments = asVkMetric(post.comments?.count);
    const shares = asVkMetric(post.reposts?.count);
    return {
      metrics: {
        ...(views !== undefined ? { views } : {}),
        ...(likes !== undefined ? { likes } : {}),
        ...(comments !== undefined ? { comments } : {}),
        ...(shares !== undefined ? { shares } : {}),
      },
      rawMetrics: {
        provider: 'vk:wall.getById',
        externalAccountId: ownerId,
        externalPostId: `${ownerId}_${postId}`,
        capturedAt: input.capturedAt.toISOString(),
        post: {
          id: post.id,
          ownerId: post.owner_id,
          ...(views !== undefined ? { views } : {}),
          ...(likes !== undefined ? { likes } : {}),
          ...(comments !== undefined ? { comments } : {}),
          ...(shares !== undefined ? { shares } : {}),
        },
      },
    };
  }
}

export class InstagramAnalyticsProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstagramAnalyticsProviderUnavailableError';
  }
}

type InstagramAnalyticsApiResponse = {
  id?: string;
  like_count?: number;
  comments_count?: number;
  data?: Array<{
    name?: string;
    values?: Array<{ value?: number }>;
  }>;
  error?: { code?: number; message?: string };
};

function assertInstagramNumericId(value: string, label: string) {
  if (!/^\d+$/.test(value)) {
    throw new InstagramAnalyticsProviderUnavailableError(`Instagram ${label} must be numeric.`);
  }
  return value;
}

function asInstagramMetric(value: number | undefined) {
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function instagramAnalyticsApiError(payload: InstagramAnalyticsApiResponse) {
  if (!payload.error) return undefined;
  const code = payload.error.code === undefined ? 'unknown' : String(payload.error.code);
  return new InstagramAnalyticsProviderUnavailableError(
    `Instagram Graph API rejected the analytics request (${code}): ${payload.error.message ?? 'unknown error'}`,
  );
}

function readInstagramInsight(data: InstagramAnalyticsApiResponse['data'], name: string) {
  return asInstagramMetric(data?.find((insight) => insight.name === name)?.values?.[0]?.value);
}

/**
 * Read-only Instagram Graph media analytics adapter. It combines direct media
 * counters with the documented media-insights edge and persists only values that
 * Graph actually returns. The OAuth token never crosses this provider boundary.
 */
export class InstagramAnalyticsRuntimeClient implements AnalyticsProviderClient {
  private readonly fetch: FetchLike;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;

  public constructor(
    options: { fetch?: FetchLike; endpoint?: string; apiVersion?: string; timeoutMs?: number } = {},
  ) {
    const apiVersion = options.apiVersion ?? process.env.INSTAGRAM_GRAPH_API_VERSION;
    if (!apiVersion) {
      throw new InstagramAnalyticsProviderUnavailableError(
        'INSTAGRAM_GRAPH_API_VERSION is required for Instagram analytics.',
      );
    }
    this.fetch = options.fetch ?? globalThis.fetch;
    this.endpoint = options.endpoint ?? 'https://graph.facebook.com';
    this.apiVersion = apiVersion;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async get(
    path: string,
    parameters: Record<string, string>,
  ): Promise<InstagramAnalyticsApiResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(
        `${this.endpoint}/${this.apiVersion}${path}?${new URLSearchParams(parameters).toString()}`,
        { method: 'GET', signal: controller.signal },
      );
      if (!response.ok) {
        throw new InstagramAnalyticsProviderUnavailableError(
          `Instagram Graph API HTTP ${response.status}.`,
        );
      }
      const payload = (await response.json()) as InstagramAnalyticsApiResponse;
      const error = instagramAnalyticsApiError(payload);
      if (error) throw error;
      return payload;
    } catch (error) {
      if (error instanceof InstagramAnalyticsProviderUnavailableError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new InstagramAnalyticsProviderUnavailableError(
          'Instagram analytics request timed out.',
        );
      }
      throw new InstagramAnalyticsProviderUnavailableError(
        'Instagram analytics request failed before a response was received.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchSnapshot(input: {
    externalAccountId: string;
    externalPostId: string;
    credentials: PublishingCredentials;
    capturedAt: Date;
  }): Promise<AnalyticsSnapshotResult> {
    if (!input.credentials.accessToken) {
      throw new InstagramAnalyticsProviderUnavailableError(
        'Instagram OAuth access token is required for analytics.',
      );
    }
    const externalAccountId = assertInstagramNumericId(
      input.externalAccountId,
      'external account id',
    );
    const externalPostId = assertInstagramNumericId(input.externalPostId, 'external post id');
    const baseParameters = { access_token: input.credentials.accessToken };
    const media = await this.get(`/${externalPostId}`, {
      ...baseParameters,
      fields: 'id,like_count,comments_count',
    });
    if (media.id !== externalPostId) {
      throw new InstagramAnalyticsProviderUnavailableError(
        'Instagram media was not found for analytics.',
      );
    }
    const insights = await this.get(`/${externalPostId}/insights`, {
      ...baseParameters,
      metric: 'impressions,reach,shares,saved',
    });
    const likes = asInstagramMetric(media.like_count);
    const comments = asInstagramMetric(media.comments_count);
    const impressions = readInstagramInsight(insights.data, 'impressions');
    const reach = readInstagramInsight(insights.data, 'reach');
    const shares = readInstagramInsight(insights.data, 'shares');
    const saves = readInstagramInsight(insights.data, 'saved');
    return {
      metrics: {
        ...(likes !== undefined ? { likes } : {}),
        ...(comments !== undefined ? { comments } : {}),
        ...(impressions !== undefined ? { impressions } : {}),
        ...(reach !== undefined ? { reach } : {}),
        ...(shares !== undefined ? { shares } : {}),
        ...(saves !== undefined ? { saves } : {}),
      },
      rawMetrics: {
        provider: 'instagram:media-insights',
        externalAccountId,
        externalPostId,
        capturedAt: input.capturedAt.toISOString(),
        media: {
          id: media.id,
          ...(likes !== undefined ? { likes } : {}),
          ...(comments !== undefined ? { comments } : {}),
        },
        insights: {
          ...(impressions !== undefined ? { impressions } : {}),
          ...(reach !== undefined ? { reach } : {}),
          ...(shares !== undefined ? { shares } : {}),
          ...(saves !== undefined ? { saves } : {}),
        },
      },
    };
  }
}

export class MockAnalyticsProvider implements AnalyticsProvider {
  public readonly platform: PublishingPlatform;

  public constructor(platform: PublishingPlatform = 'VK') {
    this.platform = platform;
  }

  async fetchSnapshot(input: {
    externalAccountId: string;
    externalPostId: string;
    credentials: PublishingCredentials;
    capturedAt: Date;
  }): Promise<AnalyticsSnapshotResult> {
    if (!input.credentials.accessToken) throw new Error('Analytics access token is required.');
    return {
      metrics: { views: 100, reach: 80, likes: 12, comments: 3, shares: 2 },
      rawMetrics: {
        provider: `mock:${this.platform.toLowerCase()}`,
        externalAccountId: input.externalAccountId,
        externalPostId: input.externalPostId,
        capturedAt: input.capturedAt.toISOString(),
      },
    };
  }
}

/** Explicit non-mock provider used when a runtime analytics integration is absent. */
export class AnalyticsProviderBlockedExternalError extends Error {
  constructor(platform: PublishingPlatform, reason: string) {
    super(`BLOCKED_EXTERNAL: ${platform} analytics is unavailable: ${reason}`);
    this.name = 'AnalyticsProviderBlockedExternalError';
  }
}

export class UnavailableAnalyticsProvider implements AnalyticsProvider {
  public constructor(
    public readonly platform: PublishingPlatform,
    private readonly reason: string,
  ) {}

  async fetchSnapshot(_input: {
    externalAccountId: string;
    externalPostId: string;
    credentials: PublishingCredentials;
    capturedAt: Date;
  }): Promise<AnalyticsSnapshotResult> {
    throw new AnalyticsProviderBlockedExternalError(this.platform, this.reason);
  }
}

export interface LearningProvider {
  analyze(input: {
    periodStart: Date;
    periodEnd: Date;
    metrics: Array<{ platform: PublishingPlatform; derived: DerivedMetrics }>;
  }): Promise<{ insight: string; recommendation: string; experiment: string; metadata?: object }>;
}

export type DerivedMetrics = { engagementRate: number | null; clickThroughRate: number | null };

export class MockLearningProvider implements LearningProvider {
  async analyze(input: {
    periodStart: Date;
    periodEnd: Date;
    metrics: Array<{ platform: PublishingPlatform; derived: DerivedMetrics }>;
  }) {
    return {
      insight: `Mock analysis covers ${input.metrics.length} publications.`,
      recommendation: 'Validate the leading signal with an approved content review.',
      experiment: 'Run one controlled variant before changing the brand strategy.',
      metadata: {
        periodStart: input.periodStart.toISOString(),
        periodEnd: input.periodEnd.toISOString(),
      },
    };
  }
}
