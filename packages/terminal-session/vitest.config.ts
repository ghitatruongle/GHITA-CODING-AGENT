import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ghita/terminal-session',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
