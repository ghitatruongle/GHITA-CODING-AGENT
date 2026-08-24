export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults?: number;
  /** Which engine produced the results */
  engine?: string;
}

export type SearchEngine = 'duckduckgo' | 'searxng';

export interface WebSearchConfig {
  /** Default search engine. Default: 'duckduckgo' */
  engine?: SearchEngine;
  /** SearXNG instance URL (for self-hosted search). */
  searxngUrl?: string;
  /** Request timeout in ms. Default: 8000 */
  timeoutMs?: number;
}

/**
 * Multi-engine web search tool. Supports DuckDuckGo Instant Answer API
 * (default, no API key needed) and self-hosted SearXNG instances.
 *
 * Usage:
 *   const search = new WebSearchTool();
 *   const res = await search.search('typescript generics');
 *
 *   // With SearXNG:
 *   const search = new WebSearchTool({ engine: 'searxng', searxngUrl: 'http://localhost:8888' });
 */
export class WebSearchTool {
  private readonly engine: SearchEngine;
  private readonly searxngUrl: string;
  private readonly timeoutMs: number;

  constructor(config?: WebSearchConfig) {
    this.engine = config?.engine ?? 'duckduckgo';
    this.searxngUrl = config?.searxngUrl ?? 'http://localhost:8888';
    this.timeoutMs = config?.timeoutMs ?? 8_000;
  }

  /**
   * Search the web using the configured engine.
   * Falls back to DuckDuckGo if the primary engine fails.
   */
  async search(query: string, maxResults: number = 5): Promise<SearchResponse> {
    try {
      if (this.engine === 'searxng') {
        return await this.searchSearXNG(query, maxResults);
      }
      return await this.searchDuckDuckGo(query, maxResults);
    } catch {
      // Fallback to DuckDuckGo if primary engine fails
      if (this.engine !== 'duckduckgo') {
        try {
          return await this.searchDuckDuckGo(query, maxResults);
        } catch {
          // Both engines failed
        }
      }
      return { query, results: [], engine: this.engine };
    }
  }

  /** DuckDuckGo Instant Answer API */
  private async searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResponse> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results: SearchResult[] = [];

    // Abstract (direct answer)
    if (data.AbstractText) {
      results.push({
        title: (data.Heading as string) || query,
        url: (data.AbstractURL as string) || '',
        snippet: data.AbstractText as string,
      });
    }

    // Related topics
    const relatedTopics = (data.RelatedTopics as Array<Record<string, unknown>>) ?? [];
    for (const topic of relatedTopics.slice(0, maxResults)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: (topic.Text as string).split(' - ')[0]?.substring(0, 80) || '',
          url: topic.FirstURL as string,
          snippet: topic.Text as string,
        });
      }
    }

    return { query, results: results.slice(0, maxResults), engine: 'duckduckgo' };
  }

  /** SearXNG meta-search engine (self-hosted) */
  private async searchSearXNG(query: string, maxResults: number): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      pageno: '1',
    });

    const url = `${this.searxngUrl}/search?${params.toString()}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`SearXNG returned ${response.status}`);
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
      number_of_results?: number;
    };

    const results: SearchResult[] = (data.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.content ?? '',
    }));

    return {
      query,
      results,
      totalResults: data.number_of_results,
      engine: 'searxng',
    };
  }
}
