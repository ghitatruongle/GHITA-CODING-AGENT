import type { HubPrompt, HubConfig, HubSearchQuery, HubPushInput } from './types.js';
/**
 * HubClient — Interface to the GHITA Prompt Hub.
 * Supports pulling, pushing, searching, and caching prompts.
 */
export declare class HubClient {
    private readonly config;
    private readonly cache;
    private readonly localPrompts;
    constructor(config: HubConfig);
    /** Pull a prompt by name (with optional version) */
    pull(name: string, version?: string): Promise<HubPrompt>;
    /** Push a prompt to the hub */
    push(input: HubPushInput): Promise<HubPrompt>;
    /** Search prompts in the hub */
    search(query: HubSearchQuery): Promise<HubPrompt[]>;
    /** Register a prompt locally (offline mode) */
    registerLocal(prompt: HubPrompt): void;
    /** List locally cached/registered prompts */
    listLocal(): HubPrompt[];
    /** Get a prompt from local cache without network call */
    getLocal(name: string, version?: string): HubPrompt | undefined;
    /** Render a prompt template with variables */
    renderPrompt(prompt: HubPrompt, variables: Record<string, unknown>): string;
    clearCache(): void;
    getCacheStats(): {
        size: number;
        keys: string[];
    };
    private getHeaders;
    private getFromCache;
    private setCache;
}
//# sourceMappingURL=hub.d.ts.map