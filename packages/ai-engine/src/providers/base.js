// ==============================================================================
// GHITA CODING AGENT - Base Provider
// ==============================================================================
import { AIUnsupportedFeatureError } from '../errors/index.js';
export class BaseProvider {
    config;
    constructor(config) {
        this.config = config;
    }
    async test() {
        try {
            const response = await this.chat([{ role: 'user', content: 'Hello' }], {
                maxTokens: 10,
            });
            return response.content.length > 0;
        }
        catch {
            return false;
        }
    }
    getModel(options) {
        return options?.model || this.config.defaultModel || this.defaultModel;
    }
    getMaxTokens(options) {
        return options?.maxTokens || this.config.maxTokens || 4096;
    }
    getTemperature(options) {
        return options?.temperature ?? this.config.temperature ?? 0.7;
    }
    getApiKey() {
        if (!this.config.apiKey) {
            throw new Error(`${this.name}: API key not configured`);
        }
        return this.config.apiKey;
    }
    getBaseUrl() {
        return this.config.baseUrl;
    }
    async embed(_text, _options) {
        throw new AIUnsupportedFeatureError(this.name, 'embed');
    }
    async embedMany(_texts, _options) {
        throw new AIUnsupportedFeatureError(this.name, 'embedMany');
    }
    async generateImage(_prompt, _options) {
        throw new AIUnsupportedFeatureError(this.name, 'generateImage');
    }
    async generateSpeech(_text, _options) {
        throw new AIUnsupportedFeatureError(this.name, 'generateSpeech');
    }
    async generateVideo(_prompt, _options) {
        throw new AIUnsupportedFeatureError(this.name, 'generateVideo');
    }
    async transcribe(_audio, _options) {
        throw new AIUnsupportedFeatureError(this.name, 'transcribe');
    }
}
//# sourceMappingURL=base.js.map