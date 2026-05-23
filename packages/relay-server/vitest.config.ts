import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['../../tests/unit/phase6-relay.test.ts'],
    testTimeout: 10000,
    alias: {
      'socket.io': resolve(__dirname, '../../tests/unit/socket-io-relay-mock.ts'),
    },
  },
});
