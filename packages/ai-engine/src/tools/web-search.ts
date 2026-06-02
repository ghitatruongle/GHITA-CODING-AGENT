// ==============================================================================
// GHITA CODING AGENT - Web Search Tool
// ==============================================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults?: number;
}

export class WebSearchTool {
  /** Tìm kiếm web qua DuckDuckGo (default) */
  async search(query: string, maxResults: number = 5): Promise<SearchResponse> {
    try {
      return await this.searchDuckDuckGo(query, maxResults);
    } catch (error) {
      return {
        query,
        results: [],
      };
    }
  }

  /** DuckDuckGo Instant Answer API */
  private async searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResponse> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
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
    if (relatedTopics) {
      for (const topic of relatedTopics.slice(0, maxResults)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: ((topic.Text as string).split(' - ')[0]?.substring(0, 80)) || '',
            url: topic.FirstURL as string,
            snippet: topic.Text as string,
          });
        }
      }
    }

    return { query, results: results.slice(0, maxResults) };
  }
}
