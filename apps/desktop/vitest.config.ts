import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['src-tauri/**', 'node_modules/**', 'src/**/*.integration.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    testTransformMode: {
      web: ['\.[jt]sx$'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.integration.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test-setup.ts',
        'src/shims.ts',
        'node_modules/**',
      ],
      thresholds: {
        statements: 20,
        branches: 30,
        functions: 25,
        lines: 20,
      },
    },
  },
});
