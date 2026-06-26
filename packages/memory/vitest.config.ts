import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    fileParallelism: false,
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'rust-napi/src/**/*.rs'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'node_modules/**', 'dist/**'],
      thresholds: {
        statements: 30,
        branches: 20,
        functions: 35,
        lines: 30,
      },
    },
  },
});
