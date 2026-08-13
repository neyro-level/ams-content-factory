import {
  InstagramOAuthProvider,
  VkOAuthProvider,
  type SocialOAuthProviderClient,
} from '../../packages/providers/src/index.js';
import { describe, expect, it } from 'vitest';

class CapturingOAuthClient implements SocialOAuthProviderClient {
  public authorizationInput?: Parameters<SocialOAuthProviderClient['createAuthorization']>[0];
  public exchangeInput?: Parameters<SocialOAuthProviderClient['exchangeCode']>[0];

  async createAuthorization(
    input: Parameters<SocialOAuthProviderClient['createAuthorization']>[0],
  ) {
    this.authorizationInput = input;
    return { authorizationUrl: `https://oauth.provider.local/authorize?state=${input.state}` };
  }

  async exchangeCode(input: Parameters<SocialOAuthProviderClient['exchangeCode']>[0]) {
    this.exchangeInput = input;
    return {
      externalAccountId: 'external-account',
      name: 'Connected account',
      username: 'connected_account',
      scopes: ['content.publish'],
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    };
  }
}

describe('provider-layer social OAuth boundary', () => {
  it('forwards a PKCE authorization and code exchange to the VK runtime client', async () => {
    const client = new CapturingOAuthClient();
    const provider = new VkOAuthProvider(client);
    const authorization = await provider.createAuthorization({
      redirectUri: 'https://app.example.test/oauth/vk/callback',
      state: 'signed-state',
      scopes: ['wall'],
      codeChallenge: 'pkce-challenge',
    });
    const grant = await provider.exchangeCode({
      code: 'authorization-code',
      redirectUri: 'https://app.example.test/oauth/vk/callback',
      codeVerifier: 'pkce-verifier',
    });

    expect(provider.platform).toBe('VK');
    expect(authorization.authorizationUrl).toContain('signed-state');
    expect(client.authorizationInput).toMatchObject({ codeChallenge: 'pkce-challenge' });
    expect(client.exchangeInput).toMatchObject({ codeVerifier: 'pkce-verifier' });
    expect(grant).toMatchObject({
      externalAccountId: 'external-account',
      scopes: ['content.publish'],
    });
  });

  it('keeps the Instagram provider behind the same provider-only contract', () => {
    const provider = new InstagramOAuthProvider(new CapturingOAuthClient());
    expect(provider.platform).toBe('INSTAGRAM');
  });
});
