// ==============================================================================
// GHITA CODING AGENT - Built-in Tools Registry
// ==============================================================================

import { WebSearchTool } from './web-search.js';
import { WebFetchTool } from './web-fetch.js';

export { WebSearchTool } from './web-search.js';
export type { SearchResult, SearchResponse } from './web-search.js';
export { WebFetchTool } from './web-fetch.js';
export type { FetchResponse } from './web-fetch.js';

/** Built-in tool definitions cho AI function calling */
export interface BuiltInTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/** Tạo built-in tools registry */
export function createBuiltInTools(): BuiltInTool[] {
  const webSearch = new WebSearchTool();
  const webFetch = new WebFetchTool();

  return [
    {
      name: 'web_search',
      description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Max results (default 5)', default: 5 },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = String(args.query ?? '');
        const maxResults = Number(args.maxResults ?? 5);
        const result = await webSearch.search(query, maxResults);
        return JSON.stringify(result, null, 2);
      },
    },
    {
      name: 'web_fetch',
      description: 'Fetch content from a URL. Returns the page content as text/markdown.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
      execute: async (args) => {
        const url = String(args.url ?? '');
        const result = await webFetch.fetch(url);
        return `Title: ${result.title}\nURL: ${result.url}\nStatus: ${result.statusCode}\n\n${result.content}`;
      },
    },
  ];
}
