// ==============================================================================
// GHITA CODING AGENT - OpenAI Provider
// ==============================================================================
import { BaseProvider } from './base.js';
const OPENAI_MODELS = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1-preview',
    'o1-mini',
];
export class OpenAIProvider extends BaseProvider {
    type = 'openai';
    name = 'OpenAI';
    defaultModel = 'gpt-4o';
    models = OPENAI_MODELS;
    constructor(config) {
        super(config);
    }
    async isReady() {
        return !!this.config.apiKey;
    }
    async chat(messages, options) {
        const apiKey = this.getApiKey();
        const model = this.getModel(options);
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: messages.map((m) => ({ role: m.role, content: m.content })),
                max_tokens: this.getMaxTokens(options),
                temperature: this.getTemperature(options),
                top_p: options?.topP,
                stop: options?.stop,
            }),
            signal: options?.signal,
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${error}`);
        }
        const data = (await response.json());
        return {
            content: data.choices[0]?.message?.content ?? '',
            model: data.model,
            provider: 'openai',
            usage: {
                promptTokens: data.usage?.prompt_tokens ?? 0,
                completionTokens: data.usage?.completion_tokens ?? 0,
                totalTokens: data.usage?.total_tokens ?? 0,
            },
            finishReason: this.mapFinishReason(data.choices[0]?.finish_reason),
        };
    }
    async *chatStream(messages, options) {
        const apiKey = this.getApiKey();
        const model = this.getModel(options);
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: messages.map((m) => ({ role: m.role, content: m.content })),
                max_tokens: this.getMaxTokens(options),
                temperature: this.getTemperature(options),
                stream: true,
            }),
            signal: options?.signal,
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${error.slice(0, 200)}`);
        }
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('text/event-stream') && !contentType?.includes('application/json')) {
            throw new Error(`Unexpected response type: ${contentType}`);
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('No response body');
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    yield { content: '', done: true, provider: 'openai', model };
                    return;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: '))
                        continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') {
                        yield { content: '', done: true, provider: 'openai', model };
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content;
                        if (content) {
                            yield { content, done: false, provider: 'openai', model };
                        }
                    }
                    catch {
                        // Expected: skip malformed JSON chunks in SSE stream
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    mapFinishReason(reason) {
        switch (reason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            default:
                return 'stop';
        }
    }
    async embed(text, options) {
        const apiKey = this.getApiKey();
        const model = options?.model ?? 'text-embedding-3-small';
        const baseUrl = this.getBaseUrl() || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                input: text,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${error}`);
        }
        const data = (await response.json());
        return {
            embedding: data.data[0]?.embedding ?? [],
            model: data.model,
            provider: 'openai',
            usage: data.usage
                ? {
                    promptTokens: data.usage.prompt_tokens,
                    totalTokens: data.usage.total_tokens,
                }
                : undefined,
        };
    }
    async embedMany(texts, options) {
        const apiKey = this.getApiKey();
        const model = options?.model ?? 'text-embedding-3-small';
        const baseUrl = this.getBaseUrl() || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                input: texts,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${error}`);
        }
        const data = (await response.json());
        const sorted = [...data.data].sort((a, b) => a.index - b.index);
        const embeddings = sorted.map((item) => item.embedding);
        return {
            embeddings,
            model: data.model,
            provider: 'openai',
            usage: data.usage
                ? {
                    promptTokens: data.usage.prompt_tokens,
                    totalTokens: data.usage.total_tokens,
                }
                : undefined,
        };
    }
    async generateImage(prompt, options) {
        const apiKey = this.getApiKey();
        const model = options?.model ?? 'dall-e-3';
        const baseUrl = this.getBaseUrl() || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                prompt,
                n: options?.n ?? 1,
                size: options?.size ?? '1024x1024',
                response_format: options?.responseFormat ?? 'url',
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${error}`);
        }
        const data = (await response.json());
        const first = data.data[0];
        if (!first)
            throw new Error('No image returned from OpenAI');
        return {
            url: first.url ?? '',
            b64: first.b64_json,
        };
    }
    async generateSpeech(text, options) {
        const apiKey = this.getApiKey();
        const model = options?.model ?? 'tts-1';
        const baseUrl = this.getBaseUrl() || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                input: text,
                voice: options?.voice ?? 'alloy',
                response_format: options?.responseFormat ?? 'mp3',
                speed: options?.speed,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${error}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audio = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        return { audio, contentType };
    }
    async transcribe(audio, options) {
        const apiKey = this.getApiKey();
        const model = options?.model ?? 'whisper-1';
        const baseUrl = this.getBaseUrl() || 'https://api.openai.com/v1';
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audio)], { type: options?.contentType || 'audio/mpeg' });
        formData.append('file', blob, options?.filename || 'audio.mp3');
        formData.append('model', model);
        if (options?.language)
            formData.append('language', options.language);
        if (options?.prompt)
            formData.append('prompt', options.prompt);
        if (options?.responseFormat)
            formData.append('response_format', options.responseFormat);
        if (options?.temperature !== undefined)
            formData.append('temperature', String(options.temperature));
        const response = await fetch(`${baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${error}`);
        }
        const data = (await response.json());
        return { text: data.text };
    }
}
//# sourceMappingURL=openai.js.map