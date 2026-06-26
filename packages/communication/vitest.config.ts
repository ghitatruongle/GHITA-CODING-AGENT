import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      '../../tests/unit/communicationServer.test.ts',
      '../../tests/unit/channels.test.ts',
    ],
    testTimeout: 10000,
    alias: {
      'socket.io': resolve(__dirname, '../../tests/unit/socket-io-mock.ts'),
      'screenshot-desktop': resolve(__dirname, '../../tests/unit/screenshot-desktop-mock.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'node_modules/**', 'dist/**'],
      thresholds: {
        statements: 35,
        branches: 40,
        functions: 40,
        lines: 35,
      },
    },
  },
});
