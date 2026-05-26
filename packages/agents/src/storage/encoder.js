// ==============================================================================
// GHITA CODING AGENT - Encoder-Backed Storage Backend
// ==============================================================================
/**
 * Wraps any StorageBackend<string> and applies custom encode/decode transforms
 * to support arbitrary types (e.g. compress, encrypt, serialize).
 */
export class EncoderBackedStorage {
    backend;
    encoder;
    decoder;
    constructor(options) {
        this.backend = options.backend;
        this.encoder = options.encoder;
        this.decoder = options.decoder;
    }
    async get(key) {
        const raw = await this.backend.get(key);
        if (raw === undefined)
            return undefined;
        try {
            return this.decoder(raw);
        }
        catch {
            return undefined;
        }
    }
    async set(key, value) {
        const encoded = this.encoder(value);
        await this.backend.set(key, encoded);
    }
    async delete(key) {
        return this.backend.delete(key);
    }
    async has(key) {
        return this.backend.has(key);
    }
    async keys() {
        return this.backend.keys();
    }
    async clear() {
        return this.backend.clear();
    }
    async size() {
        return this.backend.size();
    }
}
/** Convenience: JSON encoder/decoder pair */
export const JSONEncoder = {
    encode: (value) => JSON.stringify(value),
    decode: (encoded) => JSON.parse(encoded),
};
//# sourceMappingURL=encoder.js.map