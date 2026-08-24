/** Plugin manifest — the package.json-based descriptor for marketplace plugins */
export interface PluginManifest {
  /** Unique plugin identifier (npm-style scoped name) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Semver version string */
  version: string;
  /** Author name or org */
  author: string;
  /** Author URL */
  authorUrl?: string;
  /** License SPDX identifier */
  license?: string;
  /** Homepage URL */
  homepage?: string;
  /** Source repository URL */
  repository?: string;
  /** Plugin category */
  category: PluginCategory;
  /** Searchable tags */
  tags: string[];
  /** Icon URL or path */
  icon?: string;
  /** Main entrypoint (JS/TS file relative to plugin root) */
  entrypoint: string;
  /** Exported tool definitions */
  tools?: PluginTool[];
  /** Runtime dependencies: { name: semver-range } */
  dependencies?: Record<string, string>;
  /** Dev dependencies */
  devDependencies?: Record<string, string>;
  /** Peer dependencies */
  peerDependencies?: Record<string, string>;
  /** Required permissions */
  permissions: PluginPermission[];
  /** Minimum GHITA agent version */
  minAgentVersion?: string;
  /** Plugin size in bytes */
  size?: number;
  /** Download count (from registry) */
  downloads: number;
  /** Average rating (0-5) */
  rating: number;
  /** Number of ratings */
  ratingCount: number;
  /** Published timestamp (ms) */
  publishedAt: number;
  /** Last updated timestamp (ms) */
  updatedAt: number;
}

/** Plugin categories */
export type PluginCategory =
  | 'tool'
  | 'provider'
  | 'theme'
  | 'extension'
  | 'integration'
  | 'language'
  | 'framework'
  | 'utility';

/** Tool definition exported by a plugin */
export interface PluginTool {
  /** Tool name (used in tool registry) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool input */
  inputSchema?: Record<string, unknown>;
}

/** Permissions a plugin can request */
export type PluginPermission =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'network:http'
  | 'network:websocket'
  | 'process:spawn'
  | 'process:env'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'notification:send';

/** Installed plugin state */
export interface InstalledPlugin extends PluginManifest {
  /** When the plugin was installed */
  installedAt: number;
  /** Whether the plugin is enabled */
  enabled: boolean;
  /** Local filesystem path */
  localPath: string;
  /** Integrity hash (SHA-256) */
  integrity?: string;
}

/** Lockfile entry — pinned version for reproducible installs */
export interface LockfileEntry {
  /** Plugin ID */
  id: string;
  /** Pinned version */
  version: string;
  /** SHA-256 integrity hash */
  integrity: string;
  /** Registry URL */
  registry: string;
  /** Resolved dependency tree */
  dependencies: Record<string, string>;
  /** When this entry was last resolved */
  resolvedAt: number;
}

/** Complete lockfile structure */
export interface PluginLockfile {
  /** Lockfile format version */
  lockfileVersion: number;
  /** All pinned entries */
  entries: LockfileEntry[];
  /** When the lockfile was generated */
  generatedAt: number;
}

/** Dependency resolution result */
export interface ResolvedDependency {
  /** Package name */
  name: string;
  /** Resolved version */
  version: string;
  /** Source registry URL */
  registry: string;
  /** Whether this is a transitive dependency */
  transitive: boolean;
  /** Sub-dependencies */
  dependencies: ResolvedDependency[];
}

/** Dependency graph for resolution */
export interface DependencyGraph {
  /** Root plugin */
  root: string;
  /** All resolved nodes: { id → version } */
  resolved: Map<string, string>;
  /** Conflicts detected */
  conflicts: DependencyConflict[];
}

/** Version conflict between two plugins requiring different versions */
export interface DependencyConflict {
  /** Package name */
  package: string;
  /** Requested versions */
  requested: Array<{ by: string; range: string }>;
  /** Resolved version (if any) */
  resolved?: string;
}

/** Marketplace registry response */
export interface RegistrySearchResult {
  plugins: PluginManifest[];
  total: number;
  page: number;
  pageSize: number;
}

/** Registry search filters */
export interface RegistrySearchFilters {
  query?: string;
  category?: PluginCategory;
  tags?: string[];
  minRating?: number;
  sortBy?: 'downloads' | 'rating' | 'newest' | 'name';
  sortDir?: 'asc' | 'desc';
}

/** Install/update options */
export interface InstallOptions {
  /** Target install directory */
  installDir?: string;
  /** Force reinstall even if already installed */
  force?: boolean;
  /** Install dev dependencies */
  dev?: boolean;
  /** Registry URL override */
  registry?: string;
  /** Skip integrity check */
  skipIntegrity?: boolean;
}

/** CLI command result */
export interface CLIResult {
  success: boolean;
  message: string;
  plugin?: InstalledPlugin;
  errors?: string[];
}

/** Marketplace configuration */
export interface MarketplaceConfig {
  /** Registry base URL */
  registryUrl: string;
  /** Local install directory */
  installDir: string;
  /** Lockfile path */
  lockfilePath: string;
  /** Cache directory */
  cacheDir: string;
  /** Request timeout in ms */
  timeout: number;
}
