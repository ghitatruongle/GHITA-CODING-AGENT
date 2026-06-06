// ==============================================================================
// GHITA CODING AGENT - Marketplace Registry API Client (Phase 31)
// ==============================================================================

import type {
  PluginManifest,
  RegistrySearchResult,
  RegistrySearchFilters,
  MarketplaceConfig,
} from './types.js';

const DEFAULT_REGISTRY_URL = 'https://registry.ghita.dev';
const DEFAULT_TIMEOUT = 15_000;

/**
 * Client for the GHITA Plugin Marketplace registry.
 * Provides search, fetch, publish, and version lookup operations.
 */
export class MarketplaceRegistry {
  private config: MarketplaceConfig;

  constructor(config?: Partial<MarketplaceConfig>) {
    this.config = {
      registryUrl: config?.registryUrl ?? DEFAULT_REGISTRY_URL,
      installDir: config?.installDir ?? '',
      lockfilePath: config?.lockfilePath ?? '',
      cacheDir: config?.cacheDir ?? '',
      timeout: config?.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  /**
   * Search the registry for plugins.
   */
  async search(filters?: RegistrySearchFilters): Promise<RegistrySearchResult> {
    const params = new URLSearchParams();
    if (filters?.query) params.set('q', filters.query);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.tags?.length) params.set('tags', filters.tags.join(','));
    if (filters?.minRating !== undefined) params.set('minRating', String(filters.minRating));
    if (filters?.sortBy) params.set('sort', filters.sortBy);
    if (filters?.sortDir) params.set('dir', filters.sortDir);

    const url = `${this.config.registryUrl}/plugins?${params.toString()}`;
    const res = await this.fetch(url);
    return res as RegistrySearchResult;
  }

  /**
   * Get a specific plugin by ID.
   */
  async getPlugin(pluginId: string): Promise<PluginManifest | null> {
    try {
      const url = `${this.config.registryUrl}/plugins/${encodeURIComponent(pluginId)}`;
      const res = await this.fetch(url);
      return res as PluginManifest;
    } catch {
      return null;
    }
  }

  /**
   * Get a specific version of a plugin.
   */
  async getPluginVersion(pluginId: string, version: string): Promise<PluginManifest | null> {
    try {
      const url = `${this.config.registryUrl}/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(version)}`;
      const res = await this.fetch(url);
      return res as PluginManifest;
    } catch {
      return null;
    }
  }

  /**
   * Get all available versions for a plugin.
   */
  async getVersions(pluginId: string): Promise<string[]> {
    try {
      const url = `${this.config.registryUrl}/plugins/${encodeURIComponent(pluginId)}/versions`;
      const res = await this.fetch(url);
      return res as string[];
    } catch {
      return [];
    }
  }

  /**
   * Check for updates for installed plugins.
   * Returns map of { pluginId → latestVersion }.
   */
  async checkUpdates(
    installed: Array<{ id: string; version: string }>,
  ): Promise<Map<string, string>> {
    const updates = new Map<string, string>();

    // Batch check via POST
    try {
      const url = `${this.config.registryUrl}/plugins/check-updates`;
      const res = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugins: installed }),
      });

      const result = res as Record<string, string>;
      for (const [id, version] of Object.entries(result)) {
        const current = installed.find((p) => p.id === id);
        if (current && current.version !== version) {
          updates.set(id, version);
        }
      }
    } catch {
      // Fallback: check individually
      for (const plugin of installed) {
        const latest = await this.getVersions(plugin.id);
        if (latest.length > 0 && latest[0] !== plugin.version) {
          updates.set(plugin.id, latest[0] ?? '');
        }
      }
    }

    return updates;
  }

  /**
   * Download plugin tarball URL.
   */
  getDownloadUrl(pluginId: string, version: string): string {
    return `${this.config.registryUrl}/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(version)}/download`;
  }

  /**
   * Publish a plugin to the registry.
   */
  async publish(manifest: PluginManifest, tarball: Uint8Array): Promise<{ success: boolean; message: string }> {
    try {
      const url = `${this.config.registryUrl}/plugins/publish`;
      const formData = new FormData();
      formData.append('manifest', JSON.stringify(manifest));
      formData.append('tarball', new Blob([new Uint8Array(tarball) as unknown as BlobPart]), `${manifest.id}-${manifest.version}.tgz`);

      const res = await this.fetch(url, {
        method: 'POST',
        body: formData,
      });
      return res as { success: boolean; message: string };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // --- Private ---

  private async fetch(url: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const res = await globalThis.fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent': 'ghita-marketplace/0.1.0',
          ...(init?.headers ?? {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Registry request failed: ${res.status} ${res.statusText}`);
      }

      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
