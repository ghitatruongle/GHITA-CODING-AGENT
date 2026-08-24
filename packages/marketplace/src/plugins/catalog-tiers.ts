// Tiered catalog: .system (auto-installed core), .curated (community vetted),
// .experimental (community, unvetted), quarantine zone for flagged plugins.

import type { PluginManifest } from '../types.js';

export type CatalogTier = 'system' | 'curated' | 'experimental' | 'quarantined';

export interface TierRule {
  isSystem?: (manifest: PluginManifest) => boolean;
  curatedBy?: (manifest: PluginManifest) => boolean;
}

export interface CatalogEntry {
  manifest: PluginManifest;
  tier: CatalogTier;
  quarantined: boolean;
  quarantineReason?: string;
}

const SYSTEM_PREFIXES = ['@ghita/', 'ghita-'];

export const DEFAULT_TIER_RULE: TierRule = {
  isSystem: (m) => SYSTEM_PREFIXES.some((p) => m.id.startsWith(p)),
};

/** Assign a tier for a plugin manifest. */
export function assignTier(
  manifest: PluginManifest,
  rule: TierRule = DEFAULT_TIER_RULE,
): CatalogTier {
  if (rule.isSystem?.(manifest)) return 'system';
  if (rule.curatedBy?.(manifest)) return 'curated';
  return 'experimental';
}

/** Tiered plugin catalog with quarantine support. */
export class TieredCatalog {
  private entries = new Map<string, CatalogEntry>();

  constructor(private readonly rule: TierRule = DEFAULT_TIER_RULE) {}

  add(manifest: PluginManifest): CatalogEntry {
    const tier = assignTier(manifest, this.rule);
    const entry: CatalogEntry = { manifest, tier, quarantined: false };
    this.entries.set(manifest.id, entry);
    return entry;
  }

  /** Move a plugin to the quarantine zone. */
  quarantine(id: string, reason: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.tier = 'quarantined';
    entry.quarantined = true;
    entry.quarantineReason = reason;
    return true;
  }

  release(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.tier = assignTier(entry.manifest, this.rule);
    entry.quarantined = false;
    entry.quarantineReason = undefined;
    return true;
  }

  list(tier?: CatalogTier): CatalogEntry[] {
    const values = [...this.entries.values()];
    return tier ? values.filter((e) => e.tier === tier) : values;
  }

  get(id: string): CatalogEntry | undefined {
    return this.entries.get(id);
  }

  /** Plugins safe for automatic install (system + curated). */
  installable(): CatalogEntry[] {
    return this.list().filter((e) => e.tier === 'system' || e.tier === 'curated');
  }

  count(): Record<CatalogTier, number> {
    const out: Record<CatalogTier, number> = {
      system: 0,
      curated: 0,
      experimental: 0,
      quarantined: 0,
    };
    for (const e of this.entries.values()) out[e.tier] += 1;
    return out;
  }
}
