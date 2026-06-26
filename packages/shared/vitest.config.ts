import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      '../../tests/unit/sharedUtils.test.ts',
      '../../tests/quality-loop/qualityLoop.test.ts',
      '../../tests/quality-loop/benchmark.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/index.ts',
        'src/node.ts',
        'src/react-ui.ts',
        'src/constants.ts',
        'src/ide-types.ts',
        'src/types.ts',
        'src/utils.ts',
        'src/logger.ts',
        'src/events/**',
        'src/plugins/**',
      ],
      thresholds: {
        statements: 30,
        branches: 50,
        functions: 60,
        lines: 30,
      },
    },
  },
});
