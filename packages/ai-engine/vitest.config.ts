import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      '../../tests/unit/configLoader.test.ts',
      '../../tests/unit/crypto.test.ts',
      '../../tests/unit/orchestrator.test.ts',
      '../../tests/unit/registry.test.ts',
      '../../tests/unit/security.test.ts',
    ],
  },
});

