import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 10000,
    fileParallelism: false,
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/**/types.ts',
        'src/index.ts',
        'rust-napi/**',
        'node_modules/**',
        'dist/**',
      ],
      thresholds: {
        // Wave2 measured ~51% — meets ship target floor.
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
});
