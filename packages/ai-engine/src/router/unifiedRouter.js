// ==============================================================================
// GHITA CODING AGENT - Multi-LLM Provider Unified Router Gateway (Phase 15)
// ==============================================================================
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { ProviderRegistry } from '../registry.js';
import { CryptoHelper } from '../utils/crypto.js';
import { FallbackManager } from '../gateway/fallbackManager.js';
export class UnifiedRouter {
    type = 'custom';
    name = 'UnifiedRouterGateway';
    registry;
    defaultProvider = 'openai';
    fallbackOrder = ['openai', 'anthropic', 'google', 'ollama'];
    encryptionKey;
    configPath;
    latencyHistory = [];
    fallbackManager;
    // Keep-alive agents
    httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 });
    httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 1000 });
    constructor(options = {}) {
        this.registry = options.registry || new ProviderRegistry();
        this.defaultProvider = options.defaultProvider || 'openai';
        this.fallbackOrder = options.fallbackOrder || ['openai', 'anthropic', 'google', 'ollama'];
        this.encryptionKey = options.encryptionKey || process.env.GHITA_ENCRYPTION_KEY || 'ghita-default-secret-key-32-chars-abc';
        this.configPath = options.modelsConfigPath || path.resolve(process.cwd(), '.ghita', 'models.yaml');
        this.fallbackManager = new FallbackManager({
            dbPath: options.dbPath,
            budgetConfigPath: options.budgetConfigPath,
            fallbackChain: this.fallbackOrder.map(provider => {
                if (provider === 'openai')
                    return 'gpt-4o';
                if (provider === 'anthropic')
                    return 'claude-3-7-sonnet';
                if (provider === 'google')
                    return 'gemini-2.5-pro';
                if (provider === 'ollama')
                    return 'ollama';
                return provider;
            })
        });
        this.loadConfig();
    }
    get defaultModel() {
        const prov = this.getPrimaryProvider();
        return prov.defaultModel;
    }
    get models() {
        const prov = this.getPrimaryProvider();
        return prov.models;
    }
    /**
     * Tải và phân tích cấu hình từ file .ghita/models.yaml
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                // Fallback to environment variables if models.yaml doesn't exist
                this.loadFromEnv();
                return;
            }
            const content = fs.readFileSync(this.configPath, 'utf-8');
            const configs = this.parseSimpleYaml(content);
            if (configs.length === 0) {
                this.loadFromEnv();
                return;
            }
            for (const config of configs) {
                // Tự động giải mã API Key nếu được mã hóa AES (chứa prefix "iv:")
                if (config.apiKey && config.apiKey.includes(':')) {
                    try {
                        config.apiKey = CryptoHelper.decrypt(config.apiKey, this.encryptionKey);
                    }
                    catch (err) {
                        console.error(`Failed to decrypt API Key for provider ${config.type}. Check your encryption key.`);
                    }
                }
                // Đăng ký hoặc cập nhật provider
                this.registry.registerFromConfig(config);
            }
        }
        catch (err) {
            console.error('Failed to load .ghita/models.yaml, falling back to environment:', err);
            this.loadFromEnv();
        }
    }
    /**
     * Phân tích cú pháp YAML đơn giản không dùng thư viện ngoài
     */
    parseSimpleYaml(content) {
        const configs = [];
        const lines = content.split(/\r?\n/);
        let currentConfig = null;
        let inProvidersSection = false;
        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            const indent = line.length - line.trimStart().length;
            if (trimmed.startsWith('providers:')) {
                inProvidersSection = true;
                continue;
            }
            if (inProvidersSection) {
                // If indent returns to 0 and does not start with dash, we exited the block
                if (indent === 0 && !trimmed.startsWith('-')) {
                    inProvidersSection = false;
                    continue;
                }
                if (trimmed.startsWith('-')) {
                    if (currentConfig && currentConfig.type) {
                        configs.push(currentConfig);
                    }
                    currentConfig = {};
                    const rest = trimmed.substring(1).trim();
                    if (rest.includes(':')) {
                        const [k, ...v] = rest.split(':');
                        const key = k.trim();
                        const val = v.join(':').trim().replace(/^['"]|['"]$/g, '');
                        currentConfig[key] = val;
                    }
                }
                else if (trimmed.includes(':') && currentConfig) {
                    const [k, ...v] = trimmed.split(':');
                    const key = k.trim();
                    const val = v.join(':').trim().replace(/^['"]|['"]$/g, '');
                    if (key === 'maxTokens' || key === 'temperature') {
                        currentConfig[key] = Number(val);
                    }
                    else {
                        currentConfig[key] = val;
                    }
                }
            }
        }
        if (currentConfig && currentConfig.type) {
            configs.push(currentConfig);
        }
        return configs;
    }
    loadFromEnv() {
        const envProviders = [
            {
                type: 'openai',
                apiKey: process.env.OPENAI_API_KEY,
                baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                defaultModel: 'gpt-4o',
            },
            {
                type: 'anthropic',
                apiKey: process.env.ANTHROPIC_API_KEY,
                baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
                defaultModel: 'claude-3-5-sonnet-latest',
            },
            {
                type: 'google',
                apiKey: process.env.GEMINI_API_KEY,
                baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
                defaultModel: 'gemini-1.5-pro',
            },
            {
                type: 'ollama',
                baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
                defaultModel: 'llama3',
            }
        ];
        for (const config of envProviders) {
            if ((config.apiKey || config.type === 'ollama') && !this.registry.has(config.type)) {
                this.registry.registerFromConfig(config);
            }
        }
    }
    async isReady() {
        const primary = this.getPrimaryProvider();
        return await primary.isReady();
    }
    async test() {
        const primary = this.getPrimaryProvider();
        return await primary.test();
    }
    /**
     * Gọi mô hình chat đồng bộ (không streaming) kèm theo theo dõi độ trễ và định dạng prompt
     */
    async chat(messages, options) {
        return this.fallbackManager.executeWithFailover(async (model) => {
            const resolvedOptions = { ...options, model };
            const provider = this.resolveProvider(resolvedOptions);
            const adaptedMessages = this.adaptPrompts(messages, provider.type);
            const startTime = Date.now();
            const updatedOptions = this.injectKeepAlive(resolvedOptions, provider.type);
            try {
                const response = await provider.chat(adaptedMessages, updatedOptions);
                const durationMs = Date.now() - startTime;
                this.logLatency(provider.type, response.model, startTime, durationMs, true);
                return this.adaptResponse(response, provider.type);
            }
            catch (err) {
                const durationMs = Date.now() - startTime;
                this.logLatency(provider.type, model, startTime, durationMs, false);
                throw err;
            }
        }, messages, options);
    }
    /**
     * Gọi mô hình chat streaming, tự động định tuyến và chuẩn hóa dữ liệu chunk
     */
    async *chatStream(messages, options) {
        // Check budgets first
        const currentSessionCost = this.fallbackManager.getSessionTotalCost();
        const maxSessionCost = this.fallbackManager.budgetConfig.maxCostPerSession;
        if (currentSessionCost >= maxSessionCost) {
            throw new Error(`[BudgetExceeded] Session cost limit ($${maxSessionCost}) reached. Current: $${currentSessionCost.toFixed(4)}`);
        }
        const currentDayCost = this.fallbackManager.getDayTotalCost();
        const maxDayCost = this.fallbackManager.budgetConfig.maxCostPerDay;
        if (currentDayCost >= maxDayCost) {
            throw new Error(`[BudgetExceeded] Daily cost limit ($${maxDayCost}) reached. Current: $${currentDayCost.toFixed(4)}`);
        }
        const requestedModel = options?.model;
        const chain = requestedModel ? [requestedModel, ...this.fallbackManager.fallbackChain.filter((m) => m !== requestedModel)] : this.fallbackManager.fallbackChain;
        let success = false;
        let accumulatedContent = '';
        let finalModel = '';
        let responsePromptTokens = 0;
        for (const model of chain) {
            const resolvedOptions = { ...options, model };
            const provider = this.resolveProvider(resolvedOptions);
            const adaptedMessages = this.adaptPrompts(messages, provider.type);
            const startTime = Date.now();
            const updatedOptions = this.injectKeepAlive(resolvedOptions, provider.type);
            try {
                const stream = provider.chatStream(adaptedMessages, updatedOptions);
                let isFirstChunk = true;
                for await (const chunk of stream) {
                    if (isFirstChunk) {
                        const durationMs = Date.now() - startTime;
                        this.logLatency(provider.type, chunk.model || model, startTime, durationMs, true);
                        isFirstChunk = false;
                        finalModel = chunk.model || model;
                    }
                    accumulatedContent += chunk.content || '';
                    yield this.adaptChunk(chunk, provider.type);
                }
                success = true;
                responsePromptTokens = this.fallbackManager.countMessagesTokens(messages);
                // Log cost for successful stream
                const responseCompletionTokens = this.fallbackManager.countTokens(accumulatedContent);
                const cost = this.fallbackManager.calculateCost(finalModel, responsePromptTokens, responseCompletionTokens);
                this.fallbackManager.logCost({
                    sessionId: this.fallbackManager.sessionId,
                    provider: options?.agentRole || 'unknown-provider-stream',
                    model: finalModel,
                    promptTokens: responsePromptTokens,
                    completionTokens: responseCompletionTokens,
                    totalTokens: responsePromptTokens + responseCompletionTokens,
                    cost,
                    success: 1
                });
                break; // Stream succeeded, break the failover loop
            }
            catch (err) {
                const durationMs = Date.now() - startTime;
                this.logLatency(provider.type, model, startTime, durationMs, false);
                // Log failed stream attempt
                this.fallbackManager.logCost({
                    sessionId: this.fallbackManager.sessionId,
                    provider: options?.agentRole || 'unknown-provider-stream',
                    model,
                    promptTokens: this.fallbackManager.countMessagesTokens(messages),
                    completionTokens: 0,
                    totalTokens: this.fallbackManager.countMessagesTokens(messages),
                    cost: 0,
                    success: 0,
                    errorMessage: err.message
                });
                console.error(`🔴 STREAM FAILOVER: Model ${model} failed. Error: ${err.message}. Switching fallback...`);
            }
        }
        if (!success) {
            // Local Ollama fallback for stream
            const localModel = 'ollama/qwen2.5-coder:1.5b';
            const resolvedOptions = { ...options, model: localModel };
            const provider = this.resolveProvider(resolvedOptions);
            const adaptedMessages = this.adaptPrompts(messages, provider.type);
            const startTime = Date.now();
            const updatedOptions = this.injectKeepAlive(resolvedOptions, provider.type);
            try {
                const stream = provider.chatStream(adaptedMessages, updatedOptions);
                let isFirstChunk = true;
                for await (const chunk of stream) {
                    if (isFirstChunk) {
                        const durationMs = Date.now() - startTime;
                        this.logLatency(provider.type, chunk.model || localModel, startTime, durationMs, true);
                        isFirstChunk = false;
                        finalModel = chunk.model || localModel;
                    }
                    accumulatedContent += chunk.content || '';
                    yield this.adaptChunk(chunk, provider.type);
                }
                const responseCompletionTokens = this.fallbackManager.countTokens(accumulatedContent);
                this.fallbackManager.logCost({
                    sessionId: this.fallbackManager.sessionId,
                    provider: options?.agentRole || 'ollama-fallback-stream',
                    model: finalModel,
                    promptTokens: this.fallbackManager.countMessagesTokens(messages),
                    completionTokens: responseCompletionTokens,
                    totalTokens: this.fallbackManager.countMessagesTokens(messages) + responseCompletionTokens,
                    cost: 0,
                    success: 1
                });
            }
            catch (err) {
                throw new Error(`All remote and local Ollama streaming providers failed. Last error: ${err.message}`);
            }
        }
    }
    async embed(text, options) {
        const provider = this.resolveProvider({ model: options?.model });
        return await provider.embed(text, options);
    }
    async embedMany(texts, options) {
        const provider = this.resolveProvider({ model: options?.model });
        return await provider.embedMany(texts, options);
    }
    /**
     * Ghi vết thời gian phản hồi của các mô hình
     */
    logLatency(provider, model, startTime, durationMs, success) {
        this.latencyHistory.push({ provider, model, startTime, durationMs, success });
        if (this.latencyHistory.length > 100) {
            this.latencyHistory.shift(); // Keep last 100 entries
        }
    }
    getLatencyMetrics() {
        return [...this.latencyHistory];
    }
    /**
     * Giải quyết provider dựa trên options model, agentRole hoặc cấu hình mặc định
     */
    resolveProvider(options) {
        let resolvedType = null;
        if (options?.model) {
            const parts = options.model.split('/');
            const key = parts[0] ? parts[0].toLowerCase() : '';
            if (this.registry.has(key)) {
                resolvedType = key;
            }
            else if (options.model.includes('gpt') || options.model.includes('o1')) {
                resolvedType = 'openai';
            }
            else if (options.model.includes('claude')) {
                resolvedType = 'anthropic';
            }
            else if (options.model.includes('gemini')) {
                resolvedType = 'google';
            }
            else if (options.model.includes('deepseek')) {
                resolvedType = 'deepseek';
            }
            if (resolvedType && !this.registry.has(resolvedType)) {
                resolvedType = null;
            }
        }
        if (!resolvedType && options?.agentRole) {
            // Định tuyến thông minh theo vai trò
            if (options.agentRole === 'Plan')
                resolvedType = 'anthropic';
            else if (options.agentRole === 'Explore')
                resolvedType = 'openai';
            else if (options.agentRole === 'UI')
                resolvedType = 'google';
            if (resolvedType && !this.registry.has(resolvedType)) {
                resolvedType = null;
            }
        }
        if (!resolvedType && this.registry.has(this.defaultProvider)) {
            resolvedType = this.defaultProvider;
        }
        if (!resolvedType) {
            for (const type of this.fallbackOrder) {
                if (this.registry.has(type)) {
                    resolvedType = type;
                    break;
                }
            }
        }
        if (!resolvedType) {
            const all = this.registry.getAll();
            if (all.length > 0)
                return all[0];
            throw new Error('UnifiedRouter has no active providers registered.');
        }
        return this.registry.get(resolvedType);
    }
    getPrimaryProvider() {
        return this.resolveProvider();
    }
    /**
     * Bọc/định dạng system prompt hoặc tin nhắn phù hợp với đích đến từng mô hình (Prompt Adapter)
     */
    adaptPrompts(messages, providerType) {
        // Với DeepSeek R1 hoặc các mô hình cụ thể đòi hỏi bọc cấu trúc đặc biệt
        if (providerType === 'deepseek') {
            return messages.map(msg => {
                if (msg.role === 'system') {
                    // Bọc chỉ dẫn suy luận cho DeepSeek
                    return {
                        role: 'system',
                        content: `${msg.content}\nPlease output your step-by-step thinking process between <think> and </think> tags.`,
                    };
                }
                return msg;
            });
        }
        return messages;
    }
    /**
     * Chuẩn hóa và làm sạch Response nhận được từ LLM API
     */
    adaptResponse(response, providerType) {
        if (providerType === 'deepseek') {
            // Trích xuất hoặc chuẩn hóa phần suy luận nếu nằm ngoài content chính
            return response;
        }
        return response;
    }
    /**
     * Chuẩn hóa chunk đầu ra khi streaming
     */
    adaptChunk(chunk, providerType) {
        // Đảm bảo luôn gán đúng provider và model trong chunk đầu ra
        return {
            ...chunk,
            provider: chunk.provider || providerType,
        };
    }
    /**
     * Chèn cấu hình keep-alive cho cuộc gọi
     */
    injectKeepAlive(options, providerType) {
        // Chèn agent của unified router để giữ kết nối ổ định
        const agent = providerType === 'ollama' ? this.httpAgent : this.httpsAgent;
        return {
            ...options,
            agent, // Sẽ được adapter của provider bóc tách và chèn vào fetch options nếu được hỗ trợ
        };
    }
}
//# sourceMappingURL=unifiedRouter.js.map