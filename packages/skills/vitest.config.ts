import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/types.ts', 'src/index.ts'],
      thresholds: {
        // Wave2 measured ~49–50%. Bootstrap 45 (ship target).
        statements: 45,
        branches: 45,
        functions: 45,
        lines: 45,
      },
    },
  },
});
