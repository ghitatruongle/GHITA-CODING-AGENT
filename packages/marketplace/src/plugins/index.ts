// ==============================================================================
// GHITA CODING AGENT - Marketplace v1.1.0 Track 3: plugins public entry
// ==============================================================================

export {
  importClaudePluginJson,
  importClaudeMarketplaceJson,
  findClaudePluginManifestFiles,
  loadClaudePluginFromDir,
} from './claude-plugin.js';
export type {
  ClaudePluginJson,
  ClaudeMarketplacePlugin,
  ClaudeMarketplaceJson,
  PluginImportResult,
} from './claude-plugin.js';

export {
  PluginInstaller,
  parsePluginSpec,
  gitCloneFetcher,
  copyPluginFiles,
  installFromLocalDir,
} from './installer.js';
export type { PluginSpec, PluginFetcher, InstallResult, InstallerOptions } from './installer.js';

export { createPluginInstallerSkill } from './agent-installer-skill.js';
export type {
  PluginInstallerSkill,
  PluginInstallerSkillOptions,
  InstallFn,
  ListInstalledFn,
} from './agent-installer-skill.js';

export { assignTier, TieredCatalog, DEFAULT_TIER_RULE } from './catalog-tiers.js';
export type { CatalogTier, TierRule, CatalogEntry } from './catalog-tiers.js';

export { toMarketplaceView } from './view.js';
export type { MarketplaceViewRow, ViewContext } from './view.js';

export { computePluginHash, heuristicScan, scanPlugin, renderScanReport } from './supply-chain.js';
export type { ScanVerdict, ScanFinding, PluginScanReport, HashLookup } from './supply-chain.js';

export { evaluateTrust, trustBadge, VersionHistory, canPublish } from './trust.js';
export type { TrustLevel, TrustPolicy, TrustInput, VersionRecord } from './trust.js';
