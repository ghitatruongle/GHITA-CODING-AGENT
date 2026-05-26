import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        external: ['socket.io', 'socket.io-client'],
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
      '../../tests/unit/phase1.test.ts',
      '../../tests/unit/phase2.test.ts',
      '../../tests/unit/astLock.test.ts',
      '../../tests/phase4-test.ts',
      '../../tests/unit/phase5-platform.test.ts',
      '../../tests/unit/phase7-agentic.test.ts',
      '../../tests/unit/phase8-advanced.test.ts',
      '../../tests/unit/gitWorkflow.test.ts',
      '../../tests/unit/scti.test.ts',
      '../../tests/unit/markdownChecks.test.ts',
      '../../tests/unit/telepresence.test.ts',
      '../../packages/skills/tests/composio.test.ts',
      '../../packages/memory/tests/rustAddon.test.ts',
      '../../packages/shared/tests/sandboxCleanup.test.ts',
      '../../packages/shared/tests/ahpi.test.ts',
      '../../packages/communication/tests/telepresenceOptimization.test.ts',
    ],
  },
});

