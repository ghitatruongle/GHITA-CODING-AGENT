import { bench, describe } from 'vitest';

describe('AI Engine - Token Counter Performance', () => {
  const longText = 'Hello world '.repeat(10000);

  bench('estimateTokens with long text', async () => {
    const { estimateTokens } = await import('@ghita/ai-engine');
    estimateTokens(longText);
  }, { iterations: 50, time: 3000 });

  bench('estimateMessagesTokens with multiple messages', async () => {
    const { estimateMessagesTokens } = await import('@ghita/ai-engine');
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `This is message number ${i} with some padding content to make it realistic.`,
    }));
    estimateMessagesTokens(messages);
  }, { iterations: 50, time: 3000 });

  bench('truncateToFit within context limit', async () => {
    const { truncateToFit } = await import('@ghita/ai-engine');
    truncateToFit(longText, 1000);
  }, { iterations: 50, time: 3000 });
});

describe('AI Engine - Cache Performance', () => {
  bench('InMemoryCache get/set', async () => {
    const { InMemoryCache } = await import('@ghita/ai-engine');
    const cache = new InMemoryCache({ maxSize: 1000 });
    for (let i = 0; i < 100; i++) {
      cache.set(`key-${i}`, { data: `value-${i}` });
    }
    for (let i = 0; i < 100; i++) {
      cache.get(`key-${i}`);
    }
  }, { iterations: 20, time: 3000 });
});
