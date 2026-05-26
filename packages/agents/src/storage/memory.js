// ==============================================================================
// GHITA CODING AGENT - In-Memory Storage Backend
// ==============================================================================
export class InMemoryStorage {
    store = new Map();
    opts;
    constructor(options) {
        this.opts = {
            ttl: options?.ttl ?? 0,
            maxSize: options?.maxSize ?? 10000,
            namespace: options?.namespace ?? '',
        };
    }
    namespaced(key) {
        return this.opts.namespace ? `${this.opts.namespace}:${key}` : key;
    }
    isExpired(entry) {
        if (!entry.ttl || entry.ttl === 0)
            return false;
        return Date.now() - entry.timestamp > entry.ttl;
    }
    evict() {
        if (this.store.size <= this.opts.maxSize)
            return;
        // Remove oldest entries
        const entries = [...this.store.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.length - this.opts.maxSize;
        for (let i = 0; i < toRemove; i++) {
            this.store.delete(entries[i][0]);
        }
    }
    async get(key) {
        const nsKey = this.namespaced(key);
        const entry = this.store.get(nsKey);
        if (!entry)
            return undefined;
        if (this.isExpired(entry)) {
            this.store.delete(nsKey);
            return undefined;
        }
        return entry.value;
    }
    async set(key, value) {
        const nsKey = this.namespaced(key);
        this.store.set(nsKey, {
            key: nsKey,
            value,
            timestamp: Date.now(),
            ttl: this.opts.ttl,
        });
        this.evict();
    }
    async delete(key) {
        return this.store.delete(this.namespaced(key));
    }
    async has(key) {
        const nsKey = this.namespaced(key);
        const entry = this.store.get(nsKey);
        if (!entry)
            return false;
        if (this.isExpired(entry)) {
            this.store.delete(nsKey);
            return false;
        }
        return true;
    }
    async keys() {
        const keys = [];
        const prefix = this.opts.namespace ? `${this.opts.namespace}:` : '';
        for (const [key, entry] of this.store.entries()) {
            if (!this.isExpired(entry)) {
                keys.push(prefix ? key.slice(prefix.length) : key);
            }
        }
        return keys;
    }
    async clear() {
        if (this.opts.namespace) {
            const prefix = `${this.opts.namespace}:`;
            for (const key of this.store.keys()) {
                if (key.startsWith(prefix))
                    this.store.delete(key);
            }
        }
        else {
            this.store.clear();
        }
    }
    async size() {
        let count = 0;
        const prefix = this.opts.namespace ? `${this.opts.namespace}:` : '';
        for (const [key, entry] of this.store.entries()) {
            if (!this.isExpired(entry) && (!prefix || key.startsWith(prefix))) {
                count++;
            }
        }
        return count;
    }
}
//# sourceMappingURL=memory.js.map