const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Monorepo root
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration for GHITA Mobile
 * Configured to work within pnpm monorepo structure
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  // Watch the monorepo root for shared packages
  watchFolders: [monorepoRoot],

  resolver: {
    // Let Metro resolve packages from the monorepo node_modules
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],

    // Ensure @ghita/shared resolves from workspace
    disableHierarchicalLookup: false,

    // Allow resolving .android.js, .ios.js, .native.js extensions
    sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json', 'android.js', 'ios.js', 'native.js'],
  },

  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
