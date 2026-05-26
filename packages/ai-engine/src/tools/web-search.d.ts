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
export declare class WebSearchTool {
    /** Tìm kiếm web qua DuckDuckGo (default) */
    search(query: string, maxResults?: number): Promise<SearchResponse>;
    /** DuckDuckGo Instant Answer API */
    private searchDuckDuckGo;
}
//# sourceMappingURL=web-search.d.ts.map