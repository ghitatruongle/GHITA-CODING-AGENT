import { bench, describe } from 'vitest';

describe('Communication - Message Serialization', () => {
  const largeMessage = {
    type: 'data' as const,
    payload: {
      text: 'x'.repeat(10000),
      metadata: { timestamp: Date.now(), source: 'benchmark' },
    },
  };

  bench('serialize large JSON message', () => {
    JSON.stringify(largeMessage);
  }, { iterations: 1000, time: 2000 });

  bench('parse large JSON message', () => {
    const str = JSON.stringify(largeMessage);
    JSON.parse(str);
  }, { iterations: 1000, time: 2000 });
});
