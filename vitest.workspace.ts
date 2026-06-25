import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'apps/*/vitest.config.ts',
  {
    test: {
      name: 'root-tests',
      include: ['tests/**/*.test.ts'],
      globals: true,
      environment: 'node',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
        reportsDirectory: './coverage',
        include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**', '**/dist/**'],
        thresholds: {
          statements: 50,
          branches: 45,
          functions: 50,
          lines: 50,
        },
      },
    },
  },
]);
