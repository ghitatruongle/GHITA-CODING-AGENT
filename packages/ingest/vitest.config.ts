import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ghita/ingest',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
