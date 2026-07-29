// ==============================================================================
// v0.4.9 A5: New Provider Unit Tests
//
// Verifies the registry instantiates the five new dedicated providers with
// correct identity/models, and that AzureOpenAIProvider builds the correct
// deployment-scoped URL + api-key header and parses responses.
// ==============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProviderRegistry } from '../src/registry.js';
import {
  XAIProvider,
  OpenRouterProvider,
  TogetherProvider,
  PerplexityProvider,
  AzureOpenAIProvider,
} from '../src/providers/index.js';

describe('ProviderRegistry — dedicated v0.4.9 providers', () => {
  it('creates xAI as a first-class provider (not the custom fallback)', () => {
    const reg = new ProviderRegistry();
    const p = reg.registerFromConfig({ type: 'xai', apiKey: 'k' });
    expect(p).toBeInstanceOf(XAIProvider);
    expect(p.type).toBe('xai');
    expect(p.name).toContain('Grok');
    expect(p.models.length).toBeGreaterThan(0);
  });

  it('creates OpenRouter, Together, Perplexity dedicated providers', () => {
    const reg = new ProviderRegistry();
    expect(reg.registerFromConfig({ type: 'openrouter', apiKey: 'k' })).toBeInstanceOf(
      OpenRouterProvider,
    );
    expect(reg.registerFromConfig({ type: 'together', apiKey: 'k' })).toBeInstanceOf(
      TogetherProvider,
    );
    expect(reg.registerFromConfig({ type: 'perplexity', apiKey: 'k' })).toBeInstanceOf(
      PerplexityProvider,
    );
  });

  it('creates Azure OpenAI as its dedicated class', () => {
    const reg = new ProviderRegistry();
    const p = reg.registerFromConfig({
      type: 'azure-openai',
      apiKey: 'k',
      baseUrl: 'https://myres.openai.azure.com',
    });
    expect(p).toBeInstanceOf(AzureOpenAIProvider);
    expect(p.type).toBe('azure-openai');
  });
});

describe('AzureOpenAIProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the deployment-scoped URL with the api-key header', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
            model: 'gpt-4o',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AzureOpenAIProvider({
      type: 'azure-openai',
      apiKey: 'secret-key',
      baseUrl: 'https://myres.openai.azure.com/',
      defaultModel: 'gpt-4o-deploy',
      apiVersion: '2024-06-01',
    });

    const res = await provider.chat([{ role: 'user', content: 'hello' }]);
    expect(res.content).toBe('hi');
    expect(res.provider).toBe('azure-openai');
    expect(res.usage.totalTokens).toBe(4);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://myres.openai.azure.com/openai/deployments/gpt-4o-deploy/chat/completions?api-version=2024-06-01',
    );
    expect(init.headers).toMatchObject({ 'api-key': 'secret-key' });
  });

  it('reports ready only when baseUrl and key are configured', async () => {
    const noUrl = new AzureOpenAIProvider({ type: 'azure-openai', apiKey: 'k' });
    expect(await noUrl.isReady()).toBe(false);
    const ok = new AzureOpenAIProvider({
      type: 'azure-openai',
      apiKey: 'k',
      baseUrl: 'https://r.openai.azure.com',
    });
    expect(await ok.isReady()).toBe(true);
  });

  it('throws a clear error when baseUrl is missing on chat', async () => {
    const provider = new AzureOpenAIProvider({ type: 'azure-openai', apiKey: 'k' });
    await expect(provider.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/baseUrl/);
  });
});
