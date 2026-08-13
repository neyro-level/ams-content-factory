import type { PublishingPlatform } from './publishing';

export type SocialOAuthAuthorizationInput = {
  redirectUri: string;
  state: string;
  scopes: string[];
  codeChallenge?: string;
};

export type SocialOAuthAuthorization = {
  authorizationUrl: string;
};

export type SocialOAuthCodeExchangeInput = {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
};

export type SocialOAuthAccountGrant = {
  externalAccountId: string;
  name: string;
  username?: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
};

export type SocialOAuthTokenRefreshInput = {
  refreshToken: string;
};

export type SocialOAuthTokenRefreshResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
};

export interface SocialOAuthProvider {
  readonly platform: PublishingPlatform;
  createAuthorization(input: SocialOAuthAuthorizationInput): Promise<SocialOAuthAuthorization>;
  exchangeCode(input: SocialOAuthCodeExchangeInput): Promise<SocialOAuthAccountGrant>;
}

/**
 * Runtime HTTP clients belong to the provider layer. The application core receives
 * neither OAuth client secrets nor provider-specific callback shapes.
 */
export interface SocialOAuthProviderClient {
  createAuthorization(input: SocialOAuthAuthorizationInput): Promise<SocialOAuthAuthorization>;
  exchangeCode(input: SocialOAuthCodeExchangeInput): Promise<SocialOAuthAccountGrant>;
}

export interface SocialOAuthTokenRefreshProvider {
  readonly platform: PublishingPlatform;
  refreshToken(input: SocialOAuthTokenRefreshInput): Promise<SocialOAuthTokenRefreshResult>;
}

export interface SocialOAuthTokenRefreshClient {
  refreshToken(input: SocialOAuthTokenRefreshInput): Promise<SocialOAuthTokenRefreshResult>;
}

export class SocialOAuthRefreshUnsupportedError extends Error {
  constructor(platform: PublishingPlatform) {
    super(`${platform} OAuth runtime does not support token refresh.`);
    this.name = 'SocialOAuthRefreshUnsupportedError';
  }
}

class ClientSocialOAuthProvider implements SocialOAuthProvider {
  public constructor(
    public readonly platform: PublishingPlatform,
    protected readonly client: SocialOAuthProviderClient,
  ) {}

  createAuthorization(input: SocialOAuthAuthorizationInput) {
    return this.client.createAuthorization(input);
  }

  exchangeCode(input: SocialOAuthCodeExchangeInput) {
    return this.client.exchangeCode(input);
  }
}

abstract class ClientSocialOAuthRefreshProvider
  extends ClientSocialOAuthProvider
  implements SocialOAuthTokenRefreshProvider
{
  refreshToken(input: SocialOAuthTokenRefreshInput) {
    if (!('refreshToken' in this.client) || typeof this.client.refreshToken !== 'function') {
      throw new SocialOAuthRefreshUnsupportedError(this.platform);
    }
    return this.client.refreshToken(input);
  }
}

export class InstagramOAuthProvider extends ClientSocialOAuthRefreshProvider {
  public constructor(
    client: SocialOAuthProviderClient | (SocialOAuthProviderClient & SocialOAuthTokenRefreshClient),
  ) {
    super('INSTAGRAM', client);
  }
}

export class VkOAuthProvider extends ClientSocialOAuthRefreshProvider {
  public constructor(
    client: SocialOAuthProviderClient | (SocialOAuthProviderClient & SocialOAuthTokenRefreshClient),
  ) {
    super('VK', client);
  }
}
