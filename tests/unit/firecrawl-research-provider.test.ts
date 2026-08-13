import {
  FirecrawlResearchProvider,
  ResearchProviderUnavailableError,
} from '../../packages/providers/src/index.js';
import { describe, expect, it } from 'vitest';

describe('FirecrawlResearchProvider', () => {
  it('fails closed when a live provider credential is absent', async () => {
    const provider = new FirecrawlResearchProvider(undefined, async () => {
      throw new Error('A network request must not be attempted without a credential.');
    });

    await expect(provider.search('content operations')).rejects.toBeInstanceOf(
      ResearchProviderUnavailableError,
    );
  });

  it('maps documented search and scrape responses through the provider boundary', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetchFunction: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, body: JSON.parse(String(init?.body)) });
      if (url.endsWith('/v2/search')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              web: [
                {
                  title: 'Research result',
                  url: 'https://example.com/source',
                  description: 'Verified provider result.',
                },
              ],
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            markdown: '# Extracted source',
            metadata: {
              title: 'Extracted source',
              sourceURL: 'https://example.com/final',
              publishedAt: '2026-08-01T00:00:00.000Z',
            },
          },
        }),
      );
    };
    const provider = new FirecrawlResearchProvider('test-key', fetchFunction);

    await expect(provider.search('research')).resolves.toEqual([
      {
        title: 'Research result',
        url: 'https://example.com/source',
        snippet: 'Verified provider result.',
      },
    ]);
    await expect(provider.fetchPage('https://example.com/source')).resolves.toMatchObject({
      title: 'Extracted source',
      content: '# Extracted source',
      finalUrl: 'https://example.com/final',
      publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(requests).toEqual([
      {
        url: 'https://api.firecrawl.dev/v2/search',
        body: { query: 'research', limit: 10, sources: ['web'] },
      },
      {
        url: 'https://api.firecrawl.dev/v2/scrape',
        body: {
          url: 'https://example.com/source',
          formats: ['markdown'],
          onlyMainContent: true,
          timeout: 30_000,
        },
      },
    ]);
  });
});
