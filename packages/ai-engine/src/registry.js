// ==============================================================================
// GHITA CODING AGENT - Provider Registry
// ==============================================================================
import { AI_PROVIDERS } from '@ghita/shared';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GoogleProvider } from './providers/google.js';
import { OllamaProvider } from './providers/ollama.js';
import { CustomProvider } from './providers/custom.js';
export class ProviderRegistry {
    providers = new Map();
    /** Đăng ký một provider */
    register(provider) {
        this.providers.set(provider.type, provider);
    }
    /** Tạo và đăng ký provider từ config */
    registerFromConfig(config) {
        const provider = this.createProvider(config);
        this.register(provider);
        return provider;
    }
    /** Lấy provider theo type */
    get(type) {
        return this.providers.get(type);
    }
    /** Lấy tất cả providers */
    getAll() {
        return Array.from(this.providers.values());
    }
    /** Lấy tất cả provider types đã đăng ký */
    getTypes() {
        return Array.from(this.providers.keys());
    }
    /** Kiểm tra provider đã đăng ký chưa */
    has(type) {
        return this.providers.has(type);
    }
    /** Xoá provider */
    remove(type) {
        return this.providers.delete(type);
    }
    /** Xoá tất cả */
    clear() {
        this.providers.clear();
    }
    /** Lấy status của tất cả providers */
    async getStatus() {
        const results = [];
        for (const provider of this.providers.values()) {
            results.push({
                type: provider.type,
                name: provider.name,
                ready: await provider.isReady(),
            });
        }
        return results;
    }
    createProvider(config) {
        switch (config.type) {
            case 'openai':
                return new OpenAIProvider(config);
            case 'anthropic':
                return new AnthropicProvider(config);
            case 'google':
                return new GoogleProvider(config);
            case 'ollama':
                return new OllamaProvider(config);
            case 'custom':
                return new CustomProvider(config);
            // OpenAI-compatible providers (reuse CustomProvider)
            case 'opengateway':
            case 'mimo':
            case 'openrouter':
            case 'deepseek':
            case 'groq':
            case 'mistral':
            case 'hicap':
            case 'github-models':
                return new CustomProvider({
                    ...config,
                    providerType: config.type,
                    providerName: AI_PROVIDERS[config.type]?.name ?? config.type,
                });
            default:
                throw new Error(`Unknown provider type: ${config.type}`);
        }
    }
}
//# sourceMappingURL=registry.js.map