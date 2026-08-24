import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { UnifiedRouter } from '../src/router/unifiedRouter.js';
import { ProviderRegistry } from '../src/registry.js';
import { CryptoHelper } from '../src/utils/crypto.js';
import { SecureKeyLoader } from '../src/utils/secure-key-loader.js';
import type { AIProvider, ChatResponse } from '../src/types.js';

// Mock Provider for testing
class TestProvider implements AIProvider {
  readonly type = 'openai' as const;
  readonly name = 'MockOpenAI';
  readonly defaultModel = 'gpt-4o';
  readonly models = ['gpt-4o', 'gpt-4o-mini'];

  constructor(readonly config: any) {}

  async isReady(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async test(): Promise<boolean> {
    return true;
  }

  async chat(messages: any[], options?: any): Promise<ChatResponse> {
    return {
      content: 'Hello from Mock OpenAI!',
      model: options?.model || this.defaultModel,
      provider: 'openai',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    };
  }

  async *chatStream(messages: any[], options?: any): AsyncGenerator<any> {
    yield { content: 'Hello', done: false, provider: 'openai', model: 'gpt-4o' };
    yield { content: ' World', done: false, provider: 'openai', model: 'gpt-4o' };
    yield { content: '', done: true, provider: 'openai', model: 'gpt-4o' };
  }

  async embed(text: string): Promise<any> {
    return { embedding: [0.1, 0.2], model: 'text-embedding', provider: 'openai' };
  }

  async embedMany(texts: string[]): Promise<any> {
    return { embeddings: [[0.1, 0.2]], model: 'text-embedding', provider: 'openai' };
  }
}

describe('UnifiedRouter Gateway', () => {
  const tempDir = path.resolve(process.cwd(), '.temp_test');
  const mockYamlPath = path.resolve(tempDir, 'models.yaml');
  const secretKey = 'test-secret-key-32-chars-long-abc';

  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      if (fs.existsSync(mockYamlPath)) {
        fs.unlinkSync(mockYamlPath);
      }
      // Clean up dummy yaml too
      const dummyYaml = path.resolve(tempDir, 'dummy-provider.yaml');
      if (fs.existsSync(dummyYaml)) {
        fs.unlinkSync(dummyYaml);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should parse simple models.yaml configuration correctly', () => {
    const yamlContent = `
providers:
- type: openai
  apiKey: "test-proj-key"
  baseUrl: "https://api.openai.com/v1"
  defaultModel: "gpt-4o"
- type: anthropic
  apiKey: "test-ant-key"
  defaultModel: "claude-3-5-sonnet"
`;
    fs.writeFileSync(mockYamlPath, yamlContent, 'utf-8');

    const router = new UnifiedRouter({
      modelsConfigPath: mockYamlPath,
      encryptionKey: secretKey,
    });

    const openai = router.resolveProvider({ model: 'openai/gpt-4o' });
    expect(openai).toBeDefined();
    expect(openai.type).toBe('openai');
  });

  it('should decrypt AES-encrypted API keys using CryptoHelper', () => {
    const rawApiKey = 'test-super-secret-api-key';
    const encryptedKey = CryptoHelper.encrypt(rawApiKey, secretKey);

    const yamlContent = `
providers:
  - type: openai
    apiKey: "${encryptedKey}"
    baseUrl: "https://api.openai.com/v1"
    defaultModel: "gpt-4o"
`;
    fs.writeFileSync(mockYamlPath, yamlContent, 'utf-8');

    const router = new UnifiedRouter({
      modelsConfigPath: mockYamlPath,
      encryptionKey: secretKey,
    });

    const openai = router.resolveProvider({ model: 'openai/gpt-4o' });
    expect(openai).toBeDefined();
    // Verify decrypted key is correct
    expect((openai as any).config.apiKey).toBe(rawApiKey);
  });

  it('should fallback gracefully to environment variables if models.yaml is missing', () => {
    process.env.OPENAI_API_KEY = 'test-env-openai';

    const router = new UnifiedRouter({
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const openai = router.resolveProvider({ model: 'openai/gpt-4o' });
    expect(openai).toBeDefined();
    expect((openai as any).config.apiKey).toBe('test-env-openai');
  });

  it('should record response latency metrics correctly', async () => {
    const registry = new ProviderRegistry();
    const mockProvider = new TestProvider({ apiKey: 'mock' });
    registry.register(mockProvider);

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const response = await router.chat([{ role: 'user', content: 'hello' }]);
    expect(response.content).toBe('Hello from Mock OpenAI!');

    const metrics = router.getLatencyMetrics();
    expect(metrics.length).toBe(1);
    expect(metrics[0]?.provider).toBe('openai');
    expect(metrics[0]?.success).toBe(true);
    expect(metrics[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should route requests based on agentRole options', () => {
    const registry = new ProviderRegistry();
    const mockOpenAI = new TestProvider({ apiKey: 'openai' });

    class MockAnthropic extends TestProvider {
      readonly type = 'anthropic' as const;
      readonly name = 'MockAnthropic';
      readonly defaultModel = 'claude-3-5-sonnet';
    }
    const mockAnthropic = new MockAnthropic({ apiKey: 'anthropic' });

    registry.register(mockOpenAI);
    registry.register(mockAnthropic);

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    // Plan role should route to anthropic
    const provPlan = router.resolveProvider({ agentRole: 'Plan' });
    expect(provPlan.type).toBe('anthropic');

    // Default routes to openai
    const provDefault = router.resolveProvider();
    expect(provDefault.type).toBe('openai');
  });

  it('should stream chunks from provider', async () => {
    const registry = new ProviderRegistry();
    const mockProvider = new TestProvider({ apiKey: 'mock' });
    registry.register(mockProvider);

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const chunks: any[] = [];
    for await (const chunk of router.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(3);
    expect(chunks[0].content).toBe('Hello');
    expect(chunks[1].content).toBe(' World');
    expect(chunks[2].done).toBe(true);
  });

  it('should track latency for streaming', async () => {
    const registry = new ProviderRegistry();
    const mockProvider = new TestProvider({ apiKey: 'mock' });
    registry.register(mockProvider);

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const chunks: any[] = [];
    for await (const chunk of router.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }

    const metrics = router.getLatencyMetrics();
    expect(metrics.length).toBe(1);
    expect(metrics[0]?.success).toBe(true);
  });

  describe('Model-based routing', () => {
    let router: UnifiedRouter;

    beforeEach(() => {
      const registry = new ProviderRegistry();

      class MockAnthropic extends TestProvider {
        readonly type = 'anthropic' as const;
        readonly name = 'MockAnthropic';
      }
      class MockGoogle extends TestProvider {
        readonly type = 'google' as const;
        readonly name = 'MockGoogle';
      }
      class MockDeepSeek extends TestProvider {
        readonly type = 'deepseek' as const;
        readonly name = 'MockDeepSeek';
      }

      registry.register(new TestProvider({ apiKey: 'oai' }));
      registry.register(new MockAnthropic({ apiKey: 'ant' }));
      registry.register(new MockGoogle({ apiKey: 'goog' }));
      registry.register(new MockDeepSeek({ apiKey: 'ds' }));

      router = new UnifiedRouter({
        registry,
        defaultProvider: 'openai',
        modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
        encryptionKey: secretKey,
      });
    });

    it('should route gpt model to openai', () => {
      const prov = router.resolveProvider({ model: 'gpt-4o' });
      expect(prov.type).toBe('openai');
    });

    it('should route claude model to anthropic', () => {
      const prov = router.resolveProvider({ model: 'claude-3-5-sonnet' });
      expect(prov.type).toBe('anthropic');
    });

    it('should route gemini model to google', () => {
      const prov = router.resolveProvider({ model: 'gemini-1.5-pro' });
      expect(prov.type).toBe('google');
    });

    it('should route deepseek model to deepseek', () => {
      const prov = router.resolveProvider({ model: 'deepseek-r1' });
      expect(prov.type).toBe('deepseek');
    });
  });

  it('should inject <think> tags for DeepSeek system messages', async () => {
    const registry = new ProviderRegistry();

    const receivedMessages: any[] = [];
    class SpyDeepSeek extends TestProvider {
      readonly type = 'deepseek' as const;
      readonly name = 'SpyDeepSeek';
      async chat(messages: any[], options?: any): Promise<any> {
        receivedMessages.push(...messages);
        return {
          content: 'OK',
          model: 'deepseek-r1',
          provider: 'deepseek' as any,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: 'stop' as const,
        };
      }
    }

    registry.register(new SpyDeepSeek({ apiKey: 'ds' }));

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'deepseek',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    await router.chat([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ]);

    const sysMsg = receivedMessages.find((m: any) => m.role === 'system');
    expect(sysMsg).toBeDefined();
    expect(sysMsg.content).toContain('<think>');
    expect(sysMsg.content).toContain('You are helpful.');
  });

  it('should cap latency history at 100 entries', async () => {
    const registry = new ProviderRegistry();
    registry.register(new TestProvider({ apiKey: 'mock' }));

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    for (let i = 0; i < 105; i++) {
      await router.chat([{ role: 'user', content: `msg-${i}` }]);
    }

    const metrics = router.getLatencyMetrics();
    expect(metrics.length).toBe(100);
  });

  it('should use fallback order when default provider missing', () => {
    // Clear env vars to prevent loadFromEnv from registering providers
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    // Clear SecureKeyLoader cache so previous test loads don't leak
    SecureKeyLoader.clearCache();

    const registry = new ProviderRegistry();

    class MockGoogle extends TestProvider {
      readonly type = 'google' as const;
      readonly name = 'MockGoogle';
    }
    registry.register(new MockGoogle({ apiKey: 'g' }));

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai', // not registered
      fallbackOrder: ['anthropic', 'google'], // anthropic missing, google present
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const prov = router.resolveProvider();
    expect(prov.type).toBe('google');
  });

  it('should throw when no providers registered', () => {
    // Write a YAML with a dummy provider to prevent loadFromEnv
    // (loadFromEnv always registers ollama since it needs no apiKey)
    const dummyYaml = path.resolve(tempDir, 'dummy-provider.yaml');
    fs.writeFileSync(
      dummyYaml,
      'providers:\n  - type: opengateway\n    apiKey: "dummy"\n    defaultModel: "test"\n',
      'utf-8',
    );

    const registry = new ProviderRegistry();
    // Don't use the registry from YAML — override it empty after construction
    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      fallbackOrder: [],
      modelsConfigPath: dummyYaml,
      encryptionKey: secretKey,
    });

    // Clear the registry that was populated by loadConfig
    registry.clear();

    expect(() => router.resolveProvider()).toThrow();
  });

  it('should delegate embed to resolved provider', async () => {
    const registry = new ProviderRegistry();
    registry.register(new TestProvider({ apiKey: 'mock' }));

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const result = await router.embed('test text');
    expect(result.embedding).toEqual([0.1, 0.2]);
  });

  it('should delegate embedMany to resolved provider', async () => {
    const registry = new ProviderRegistry();
    registry.register(new TestProvider({ apiKey: 'mock' }));

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const result = await router.embedMany(['text1', 'text2']);
    expect(result.embeddings).toBeDefined();
    expect(result.embeddings.length).toBe(1); // TestProvider returns 1
  });

  it('should fallback to env when YAML file is empty', () => {
    fs.writeFileSync(mockYamlPath, '', 'utf-8');
    process.env.OPENAI_API_KEY = 'test-fallback';

    const router = new UnifiedRouter({
      modelsConfigPath: mockYamlPath,
      encryptionKey: secretKey,
    });

    const prov = router.resolveProvider({ model: 'gpt-4o' });
    expect(prov).toBeDefined();
  });

  it('should delegate isReady to primary provider', async () => {
    const registry = new ProviderRegistry();
    registry.register(new TestProvider({ apiKey: 'mock' }));

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const ready = await router.isReady();
    expect(ready).toBe(true);
  });

  it('should delegate test to primary provider', async () => {
    const registry = new ProviderRegistry();
    registry.register(new TestProvider({ apiKey: 'mock' }));

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    const ok = await router.test();
    expect(ok).toBe(true);
  });

  it('should expose defaultModel and models from primary provider', () => {
    const registry = new ProviderRegistry();
    registry.register(new TestProvider({ apiKey: 'mock' }));

    const router = new UnifiedRouter({
      registry,
      defaultProvider: 'openai',
      modelsConfigPath: path.resolve(tempDir, 'missing.yaml'),
      encryptionKey: secretKey,
    });

    expect(router.defaultModel).toBe('gpt-4o');
    expect(router.models).toContain('gpt-4o');
  });
});

// CryptoHelper — dedicated tests

describe('CryptoHelper', () => {
  const key = 'test-secret-key-32-chars-long-abc';

  it('should round-trip encrypt and decrypt correctly', () => {
    const original = 'test-my-super-secret-api-key-12345';
    const encrypted = CryptoHelper.encrypt(original, key);
    const decrypted = CryptoHelper.decrypt(encrypted, key);
    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertexts for same input (random IV)', () => {
    const text = 'same-text';
    const enc1 = CryptoHelper.encrypt(text, key);
    const enc2 = CryptoHelper.encrypt(text, key);
    expect(enc1).not.toBe(enc2); // Different IVs
  });

  it('should throw on decrypt with wrong key', () => {
    const encrypted = CryptoHelper.encrypt('secret', key);
    expect(() => CryptoHelper.decrypt(encrypted, 'wrong-key-that-is-different')).toThrow();
  });

  it('should throw on corrupted encrypted data', () => {
    expect(() => CryptoHelper.decrypt('corrupted:data', key)).toThrow();
  });

  it('should throw on data with invalid format', () => {
    expect(() => CryptoHelper.decrypt('no-colon-separator', key)).toThrow();
  });
});
