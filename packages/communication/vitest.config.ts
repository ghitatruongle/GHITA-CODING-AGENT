import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['../../tests/unit/communicationServer.test.ts'],
    testTimeout: 10000,
    alias: {
      'socket.io': resolve(__dirname, '../../tests/unit/socket-io-mock.ts'),
      'screenshot-desktop': resolve(__dirname, '../../tests/unit/screenshot-desktop-mock.ts'),
    },
  },
});




