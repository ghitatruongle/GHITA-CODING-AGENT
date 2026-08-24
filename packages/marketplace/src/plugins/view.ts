// View-model for the Marketplace UI: version picker, license badge, tier,
// trust badge, quarantine status — data layer for the desktop view.

import type { PluginManifest } from '../types.js';
import type { CatalogEntry } from './catalog-tiers.js';

/** Local license classification (mirrors the skills license engine). */
function classifyLicense(raw: string | undefined): { class: string } {
  if (!raw) return { class: 'unknown' };
  const lowered = raw.toLowerCase();
  if (
    lowered.includes('mit') ||
    lowered.includes('apache') ||
    lowered.includes('bsd') ||
    lowered.includes('isc') ||
    lowered.includes('cc0') ||
    lowered.includes('unlicense')
  ) {
    return { class: 'permissive' };
  }
  if (
    lowered.includes('gpl') ||
    lowered.includes('agpl') ||
    lowered.includes('mpl') ||
    lowered.includes('lgpl')
  ) {
    return { class: 'copyleft' };
  }
  if (lowered.includes('proprietary')) return { class: 'proprietary' };
  return { class: 'unknown' };
}

export interface MarketplaceViewRow {
  id: string;
  name: string;
  description: string;
  version: string;
  /** Available versions for the picker (from catalog history). */
  versions: string[];
  license: string;
  licenseClass: string;
  tier: string;
  quarantined: boolean;
  publisher: string;
  downloads: number;
  rating: number;
  trustBadge: string;
}

export interface ViewContext {
  tiers?: Map<string, CatalogEntry>;
  versions?: Map<string, string[]>;
  trust?: Map<string, string>;
}

/** Build view rows for the Marketplace UI. */
export function toMarketplaceView(
  manifests: readonly PluginManifest[],
  context: ViewContext = {},
): MarketplaceViewRow[] {
  return manifests.map((m) => {
    const tier = context.tiers?.get(m.id);
    const versions = context.versions?.get(m.id) ?? [m.version];
    const trust = context.trust?.get(m.id) ?? 'community';
    const license = classifyLicense(m.license);
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      version: m.version,
      versions,
      license: m.license ?? 'unknown',
      licenseClass: license.class,
      tier: tier?.tier ?? 'experimental',
      quarantined: tier?.quarantined ?? false,
      publisher: m.author,
      downloads: m.downloads,
      rating: m.rating,
      trustBadge: trust,
    };
  });
}
