import {
  createMcpAuthService,
  type McpAuthContext,
  type McpScope,
} from '@ams-content-factory/core';

type McpAuthenticator = Pick<ReturnType<typeof createMcpAuthService>, 'authenticate' | 'markUsed'>;

export class McpAuthenticationError extends Error {
  constructor(message = 'A valid MCP bearer API key is required.') {
    super(message);
    this.name = 'McpAuthenticationError';
  }
}

function bearerToken(authorization: string | undefined) {
  const match = authorization?.match(/^Bearer (amscf_[A-Za-z0-9_-]{43})$/);
  return match?.[1] ?? null;
}

/**
 * Resolves the bearer key before a tool handler is created. The key itself is never returned
 * to a handler; handlers receive only organization, scope and permission context.
 */
export function createMcpAuthContextResolver(
  authenticator: McpAuthenticator = createMcpAuthService(),
) {
  return {
    async resolve(input: {
      authorization?: string;
      requiredScope: McpScope;
    }): Promise<McpAuthContext> {
      const token = bearerToken(input.authorization);
      if (!token) throw new McpAuthenticationError();
      const context = await authenticator.authenticate(token, input.requiredScope);
      if (!context) throw new McpAuthenticationError();
      await authenticator.markUsed(context);
      return context;
    },
  };
}
