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
