import { describe, expect, it, vi } from 'vitest';
import {
  createErrorReporter,
  createStructuredLogger,
  redactSecrets,
} from '../../packages/observability/src/index.js';

describe('structured logger', () => {
  it('emits the approved correlation and outcome fields with a deterministic timestamp', () => {
    const sink = vi.fn();
    const logger = createStructuredLogger({ sink, clock: () => '2026-08-13T00:00:00.000Z' });

    logger.error({
      event: 'publication.dispatch.failed',
      requestId: 'request-1',
      organizationId: 'organization-1',
      brandId: 'brand-1',
      workflowRunId: 'workflow-1',
      contentProjectId: 'content-1',
      publicationId: 'publication-1',
      provider: 'vk',
      providerJobId: 'provider-1',
      durationMs: 250,
      errorCode: 'OUTCOME_UNKNOWN',
    });

    expect(sink).toHaveBeenCalledWith({
      timestamp: '2026-08-13T00:00:00.000Z',
      level: 'error',
      event: 'publication.dispatch.failed',
      requestId: 'request-1',
      organizationId: 'organization-1',
      brandId: 'brand-1',
      workflowRunId: 'workflow-1',
      contentProjectId: 'content-1',
      publicationId: 'publication-1',
      provider: 'vk',
      providerJobId: 'provider-1',
      durationMs: 250,
      errorCode: 'OUTCOME_UNKNOWN',
    });
  });

  it('redacts nested credential fields and bearer or raw MCP tokens', () => {
    expect(
      redactSecrets({
        password: 'password-value',
        nested: { refreshToken: 'refresh-value', headers: { authorization: 'Bearer secret' } },
        body: 'MCP token amscf_1234567890123456789012345678901234567890123',
      }),
    ).toEqual({
      password: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', headers: { authorization: '[REDACTED]' } },
      body: 'MCP token [REDACTED]',
    });
  });

  it('forwards redacted error context to an infrastructure-compatible sink', () => {
    const sink = vi.fn();
    const reporter = createErrorReporter({ sink });

    reporter.report(new Error('Provider failed with Bearer super-secret'), {
      accessToken: 'secret-token',
      requestId: 'request-1',
    });

    expect(sink).toHaveBeenCalledWith({
      error: { name: 'Error', message: 'Provider failed with Bearer [REDACTED]' },
      context: { accessToken: '[REDACTED]', requestId: 'request-1' },
    });
  });
});
