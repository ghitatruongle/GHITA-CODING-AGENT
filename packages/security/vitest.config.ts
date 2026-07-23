import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/types.ts', 'node_modules/**', 'dist/**'],
      thresholds: {
        // Measured ~77% lines after v0.1.5 unit blitz (types excluded).
        statements: 70,
        branches: 70,
        functions: 80,
        lines: 70,
      },
    },
  },
});
