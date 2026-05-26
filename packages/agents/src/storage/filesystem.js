// ==============================================================================
// GHITA CODING AGENT - Filesystem Storage Backend
// ==============================================================================
export class FileSystemStorage {
    basePath;
    extension;
    ttl;
    constructor(options) {
        this.basePath = options.basePath;
        this.extension = options.extension ?? '.json';
        this.ttl = options.ttl ?? 0;
    }
    filePath(key) {
        // Sanitize key to safe filename
        const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `${this.basePath}/${safe}${this.extension}`;
    }
    isExpired(entry) {
        if (!entry.ttl || entry.ttl === 0)
            return false;
        return Date.now() - entry.timestamp > entry.ttl;
    }
    async readEntry(key) {
        try {
            // Uses dynamic import to avoid top-level fs dependency (works in both Node and edge)
            const fs = await import('node:fs/promises');
            const raw = await fs.readFile(this.filePath(key), 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    async writeEntry(key, entry) {
        const fs = await import('node:fs/promises');
        await fs.mkdir(this.basePath, { recursive: true });
        await fs.writeFile(this.filePath(key), JSON.stringify(entry), 'utf-8');
    }
    async get(key) {
        const entry = await this.readEntry(key);
        if (!entry)
            return undefined;
        if (this.isExpired(entry)) {
            await this.delete(key);
            return undefined;
        }
        return entry.value;
    }
    async set(key, value) {
        await this.writeEntry(key, {
            key,
            value,
            timestamp: Date.now(),
            ttl: this.ttl,
        });
    }
    async delete(key) {
        try {
            const fs = await import('node:fs/promises');
            await fs.unlink(this.filePath(key));
            return true;
        }
        catch {
            return false;
        }
    }
    async has(key) {
        const entry = await this.readEntry(key);
        if (!entry)
            return false;
        if (this.isExpired(entry)) {
            await this.delete(key);
            return false;
        }
        return true;
    }
    async keys() {
        try {
            const fs = await import('node:fs/promises');
            const files = await fs.readdir(this.basePath);
            return files
                .filter((f) => f.endsWith(this.extension))
                .map((f) => f.slice(0, -this.extension.length));
        }
        catch {
            return [];
        }
    }
    async clear() {
        const keys = await this.keys();
        for (const key of keys) {
            await this.delete(key);
        }
    }
    async size() {
        const keys = await this.keys();
        return keys.length;
    }
}
//# sourceMappingURL=filesystem.js.map