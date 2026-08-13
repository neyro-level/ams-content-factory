export type SearchResult = { title: string; url: string; snippet?: string };
export type FetchedResearchPage = {
  title: string;
  content: string;
  finalUrl: string;
  publishedAt?: Date;
};

export interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}

export interface PageFetcherProvider {
  fetchPage(url: string): Promise<FetchedResearchPage>;
}

type FetchFunction = typeof fetch;

export class ResearchProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchProviderUnavailableError';
  }
}

export class FirecrawlResearchProvider implements SearchProvider, PageFetcherProvider {
  constructor(
    private readonly apiKey = process.env.FIRECRAWL_API_KEY,
    private readonly fetchFunction: FetchFunction = fetch,
    private readonly baseUrl = 'https://api.firecrawl.dev',
  ) {}

  async search(query: string): Promise<SearchResult[]> {
    const payload = await this.request('/v2/search', {
      query,
      limit: 10,
      sources: ['web'],
    });
    const web = asRecord(payload.data)?.web;
    if (!Array.isArray(web)) return [];
    return web.flatMap((entry) => {
      const result = asRecord(entry);
      const title = typeof result.title === 'string' ? result.title : '';
      const url = typeof result.url === 'string' ? result.url : '';
      if (!title || !url) return [];
      return [
        {
          title,
          url,
          ...(typeof result.description === 'string' ? { snippet: result.description } : {}),
        },
      ];
    });
  }

  async fetchPage(url: string): Promise<FetchedResearchPage> {
    const payload = await this.request('/v2/scrape', {
      url,
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: 30_000,
    });
    const data = asRecord(payload.data);
    const metadata = asRecord(data.metadata);
    const content = typeof data.markdown === 'string' ? data.markdown : '';
    if (!content.trim()) throw new Error('Firecrawl scrape response contains no markdown content.');
    const finalUrl =
      typeof metadata.sourceURL === 'string'
        ? metadata.sourceURL
        : typeof metadata.url === 'string'
          ? metadata.url
          : url;
    const publishedAt = parseDate(metadata.publishedTime) ?? parseDate(metadata.publishedAt);
    return {
      title: typeof metadata.title === 'string' ? metadata.title : '',
      content,
      finalUrl,
      ...(publishedAt ? { publishedAt } : {}),
    };
  }

  private async request(path: string, body: object): Promise<Record<string, unknown>> {
    if (!this.apiKey) {
      throw new ResearchProviderUnavailableError(
        'BLOCKED_EXTERNAL: FIRECRAWL_API_KEY is required for research extraction.',
      );
    }
    const response = await this.fetchFunction(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Firecrawl request failed with HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    const record = asRecord(payload);
    if (record.success !== true) throw new Error('Firecrawl response did not confirm success.');
    return record;
  }
}

export class MockSearchProvider implements SearchProvider {
  constructor(private readonly results: SearchResult[] = []) {}
  async search(): Promise<SearchResult[]> {
    return this.results;
  }
}

export class MockPageFetcherProvider implements PageFetcherProvider {
  constructor(private readonly pages: Record<string, FetchedResearchPage> = {}) {}
  async fetchPage(url: string): Promise<FetchedResearchPage> {
    const page = this.pages[url];
    if (!page) throw new Error(`Mock research page is not configured for ${url}.`);
    return page;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseDate(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}
