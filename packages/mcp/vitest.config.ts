import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ghita/mcp',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
