import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'react-native-bluetooth-classic': path.resolve(__dirname, '../../tests/unit/react-native-bluetooth-classic-mock.ts'),
      'react-native': path.resolve(__dirname, '../../tests/unit/react-native-mock.ts'),
    },
  },
  ssr: {
    noExternal: ['react-native', 'react-native-bluetooth-classic', '@ghita/mobile', /apps\/mobile/],
  },
  test: {
    deps: {
      optimizer: {
        ssr: {
          include: ['react-native', 'react-native-bluetooth-classic'],
        },
      },
    },
    alias: {
      'react-native-bluetooth-classic': path.resolve(__dirname, '../../tests/unit/react-native-bluetooth-classic-mock.ts'),
      'react-native': path.resolve(__dirname, '../../tests/unit/react-native-mock.ts'),
    },
    globals: true,
    environment: 'node',
    server: {
      deps: {
        external: ['socket.io', 'socket.io-client'],
        inline: [
          /@ghita\//,
          /apps\//,
          'react-native',
          'react-native-bluetooth-classic',
        ],
      },
    },
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      '../../tests/unit/configLoader.test.ts',
      '../../tests/unit/fileExplorer.test.ts',
      '../../tests/unit/crypto.test.ts',
      '../../tests/unit/orchestrator.test.ts',
      '../../tests/unit/registry.test.ts',
      '../../tests/unit/security.test.ts',
      '../../tests/unit/foundation.test.ts',
      '../../tests/unit/core-orchestrator.test.ts',
      '../../tests/unit/astLock.test.ts',
      '../../tests/advanced-agent.test.ts',
      '../../tests/unit/platform-features.test.ts',
      '../../tests/unit/agentic-execution.test.ts',
      '../../tests/unit/telemetry.test.ts',
      '../../tests/unit/gitWorkflow.test.ts',
      '../../tests/unit/scti.test.ts',
      '../../tests/unit/markdownChecks.test.ts',
      '../../tests/unit/telepresence.test.ts',
      '../../packages/skills/tests/composio.test.ts',
      '../../packages/memory/tests/rustAddon.test.ts',
      '../../packages/memory/tests/tiered-memory.test.ts',
      '../../packages/shared/tests/sandboxCleanup.test.ts',
      '../../packages/shared/tests/ahpi.test.ts',
      '../../packages/communication/tests/telepresenceOptimization.test.ts',
      '../../tests/unit/llm-judge.test.ts',
      '../../tests/unit/mcp-servers.test.ts',
      '../../tests/unit/graph-rag.test.ts',
      '../../tests/unit/mobile-ble.test.ts',
      '../../tests/unit/phase8-channels.test.ts',
    ],
  },
});
