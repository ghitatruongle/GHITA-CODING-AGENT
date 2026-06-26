/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  tsconfigFile: 'tsconfig.base.json',
  mutate: [
    'packages/security/src/**/*.ts',
    'packages/browser-control/src/**/*.ts',
    'packages/ai-engine/src/utils/security.ts',
    'packages/ai-engine/src/utils/crypto.ts',
    'packages/communication/src/utils/security.ts',
  ],
  thresholds: {
    high: 80,
    low: 70,
    break: 60,
  },
  vitest: {
    configFile: 'packages/security/vitest.config.ts',
  },
};
export default config;
