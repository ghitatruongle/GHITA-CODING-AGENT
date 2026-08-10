import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ghita/native-bridge',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
