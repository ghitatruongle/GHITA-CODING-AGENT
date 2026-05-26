export { WebSearchTool } from './web-search.js';
export type { SearchResult, SearchResponse } from './web-search.js';
export { WebFetchTool } from './web-fetch.js';
export type { FetchResponse } from './web-fetch.js';
export * from './workspace-tools.js';
/** Built-in tool definitions cho AI function calling */
export interface BuiltInTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<string>;
}
/** Tạo built-in tools registry */
export declare function createBuiltInTools(): BuiltInTool[];
//# sourceMappingURL=index.d.ts.map