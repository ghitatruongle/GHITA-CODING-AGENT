import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/extension.ts',
        'src/vscode.d.ts',
      ],
      thresholds: {
        // extension.ts is excluded (it runs inside the VS Code runtime and
        // cannot be unit-tested in Node). sync.ts is the extracted pure
        // module and has 100% coverage as of this commit.
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});