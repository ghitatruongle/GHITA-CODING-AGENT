// ==============================================================================
// GHITA CODING AGENT - Web Search Tool
// ==============================================================================
export class WebSearchTool {
    /** Tìm kiếm web qua DuckDuckGo (default) */
    async search(query, maxResults = 5) {
        try {
            return await this.searchDuckDuckGo(query, maxResults);
        }
        catch (error) {
            return {
                query,
                results: [],
            };
        }
    }
    /** DuckDuckGo Instant Answer API */
    async searchDuckDuckGo(query, maxResults) {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            throw new Error(`DuckDuckGo returned ${response.status}`);
        }
        const data = (await response.json());
        const results = [];
        // Abstract (direct answer)
        if (data.AbstractText) {
            results.push({
                title: data.Heading || query,
                url: data.AbstractURL || '',
                snippet: data.AbstractText,
            });
        }
        // Related topics
        if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, maxResults)) {
                if (topic.Text && topic.FirstURL) {
                    results.push({
                        title: topic.Text.split(' - ')[0]?.substring(0, 80) || '',
                        url: topic.FirstURL,
                        snippet: topic.Text,
                    });
                }
            }
        }
        return { query, results: results.slice(0, maxResults) };
    }
}
//# sourceMappingURL=web-search.js.map