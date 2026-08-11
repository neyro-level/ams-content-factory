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
