// ==============================================================================
// GHITA CODING AGENT - Hub Integration (Prompt Hub)
// ==============================================================================
/**
 * HubClient — Interface to the GHITA Prompt Hub.
 * Supports pulling, pushing, searching, and caching prompts.
 */
export class HubClient {
    config;
    cache = new Map();
    localPrompts = new Map();
    constructor(config) {
        this.config = {
            serverUrl: config.serverUrl,
            apiKey: config.apiKey ?? '',
            namespace: config.namespace ?? 'default',
            cacheTtl: config.cacheTtl ?? 5 * 60 * 1000, // 5 minutes default
        };
    }
    // --- Pull ---
    /** Pull a prompt by name (with optional version) */
    async pull(name, version) {
        const cacheKey = `${this.config.namespace}/${name}@${version ?? 'latest'}`;
        // Check cache first
        const cached = this.getFromCache(cacheKey);
        if (cached)
            return cached;
        // Try local store
        const local = this.localPrompts.get(cacheKey);
        if (local)
            return local;
        // Fetch from hub server
        const url = new URL(`/api/prompts/${encodeURIComponent(name)}`, this.config.serverUrl);
        if (version)
            url.searchParams.set('version', version);
        url.searchParams.set('namespace', this.config.namespace);
        const response = await fetch(url.toString(), {
            headers: this.getHeaders(),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            throw new Error(`Hub pull failed: ${response.status} ${response.statusText}`);
        }
        const prompt = (await response.json());
        this.setCache(cacheKey, prompt);
        return prompt;
    }
    // --- Push ---
    /** Push a prompt to the hub */
    async push(input) {
        const url = new URL('/api/prompts', this.config.serverUrl);
        url.searchParams.set('namespace', this.config.namespace);
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                ...this.getHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
            throw new Error(`Hub push failed: ${response.status} ${response.statusText}`);
        }
        const prompt = (await response.json());
        const cacheKey = `${this.config.namespace}/${prompt.name}@${prompt.version}`;
        this.setCache(cacheKey, prompt);
        this.localPrompts.set(cacheKey, prompt);
        return prompt;
    }
    // --- Search ---
    /** Search prompts in the hub */
    async search(query) {
        const url = new URL('/api/prompts/search', this.config.serverUrl);
        if (query.query)
            url.searchParams.set('q', query.query);
        if (query.model)
            url.searchParams.set('model', query.model);
        if (query.author)
            url.searchParams.set('author', query.author);
        if (query.limit)
            url.searchParams.set('limit', String(query.limit));
        for (const tag of query.tags ?? []) {
            url.searchParams.append('tags', tag);
        }
        url.searchParams.set('namespace', this.config.namespace);
        const response = await fetch(url.toString(), {
            headers: this.getHeaders(),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            throw new Error(`Hub search failed: ${response.status}`);
        }
        return (await response.json());
    }
    // --- Local Prompt Management ---
    /** Register a prompt locally (offline mode) */
    registerLocal(prompt) {
        const cacheKey = `${this.config.namespace}/${prompt.name}@${prompt.version}`;
        this.localPrompts.set(cacheKey, prompt);
    }
    /** List locally cached/registered prompts */
    listLocal() {
        return [...this.localPrompts.values()];
    }
    /** Get a prompt from local cache without network call */
    getLocal(name, version) {
        const cacheKey = `${this.config.namespace}/${name}@${version ?? 'latest'}`;
        return this.localPrompts.get(cacheKey) ?? this.getFromCache(cacheKey);
    }
    // --- Render ---
    /** Render a prompt template with variables */
    renderPrompt(prompt, variables) {
        let rendered = prompt.template;
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            rendered = rendered.replaceAll(placeholder, String(value));
        }
        return rendered;
    }
    // --- Cache Management ---
    clearCache() {
        this.cache.clear();
    }
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: [...this.cache.keys()],
        };
    }
    // --- Private Helpers ---
    getHeaders() {
        const headers = {};
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        return headers;
    }
    getFromCache(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() - entry.cachedAt > entry.ttl) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.prompt;
    }
    setCache(key, prompt) {
        this.cache.set(key, {
            prompt,
            cachedAt: Date.now(),
            ttl: this.config.cacheTtl,
        });
    }
}
//# sourceMappingURL=hub.js.map