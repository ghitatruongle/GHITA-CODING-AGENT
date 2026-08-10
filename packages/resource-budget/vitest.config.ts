import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ghita/resource-budget',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
