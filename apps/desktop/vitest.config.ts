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
  },
});
