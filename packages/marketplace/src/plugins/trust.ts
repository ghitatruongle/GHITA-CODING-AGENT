// Publisher trust model: trusted / verified / community / quarantined with
// pinning (tag/digest), auto-update policy and rollback-safe version history.

import type { PluginManifest } from '../types.js';
import type { ScanVerdict } from './supply-chain.js';

export type TrustLevel = 'trusted' | 'verified' | 'community' | 'quarantined';

export interface TrustPolicy {
  /** Trust level assigned to the publisher/plugin. */
  level: TrustLevel;
  /** Publisher identity (e.g. GitHub org/user). */
  publisherId?: string;
  /** Pinned install ref (tag or branch). */
  pinnedTag?: string;
  /** Pinned content digest (folder hash / commit sha). */
  pinnedDigest?: string;
  /** Auto-update only allowed for trusted/verified. */
  allowAutoUpdate?: boolean;
}

export interface TrustInput {
  publisherId?: string;
  signature?: string;
  scanVerdict?: ScanVerdict;
  /** Download/rating reputation signal. */
  reputation?: number;
}

/** Evaluate the effective trust level from inputs + policy. */
export function evaluateTrust(
  policy: TrustPolicy,
  input: TrustInput = {},
): {
  level: TrustLevel;
  reason: string;
} {
  if (input.scanVerdict === 'malicious') {
    return { level: 'quarantined', reason: 'supply-chain scan flagged as malicious' };
  }
  if (input.scanVerdict === 'suspicious') {
    return { level: 'quarantined', reason: 'supply-chain scan flagged as suspicious' };
  }
  const base = policy.level;
  if (base === 'trusted' || base === 'verified') {
    return { level: base, reason: `publisher trust level: ${base}` };
  }
  if ((input.reputation ?? 0) < 0.2) {
    return { level: 'community', reason: 'low reputation — community tier' };
  }
  return { level: base, reason: 'community tier by default' };
}

/** Human badge for a trust level. */
export function trustBadge(level: TrustLevel): string {
  switch (level) {
    case 'trusted':
      return '🛡️ trusted';
    case 'verified':
      return '✅ verified';
    case 'community':
      return '🌱 community';
    case 'quarantined':
      return '🚫 quarantined';
  }
}

export interface VersionRecord {
  version: string;
  pinnedDigest?: string;
  installedAt: string;
}

/** Version history that supports pinning and rollback. */
export class VersionHistory {
  private versions = new Map<string, VersionRecord[]>();

  record(pluginId: string, version: string, pinnedDigest?: string): void {
    const list = this.versions.get(pluginId) ?? [];
    list.push({ version, pinnedDigest, installedAt: new Date().toISOString() });
    this.versions.set(pluginId, list);
  }

  list(pluginId: string): VersionRecord[] {
    return this.versions.get(pluginId) ?? [];
  }

  /** Previous version (rollback target), or undefined. */
  previous(pluginId: string): VersionRecord | undefined {
    const list = this.list(pluginId);
    return list.length >= 2 ? list[list.length - 2] : undefined;
  }

  rollback(pluginId: string): VersionRecord | undefined {
    const prev = this.previous(pluginId);
    const list = this.versions.get(pluginId);
    if (prev && list) {
      this.versions.set(pluginId, list.slice(0, -1));
    }
    return prev;
  }
}

/** Publish gate: deny publishing when the policy says so. */
export function canPublish(
  manifest: PluginManifest,
  policy: TrustPolicy,
  scanVerdict?: ScanVerdict,
): {
  allowed: boolean;
  reason: string;
} {
  if (scanVerdict === 'malicious' || scanVerdict === 'suspicious') {
    return { allowed: false, reason: `scan verdict "${scanVerdict}" blocks publishing` };
  }
  if (policy.level === 'quarantined') {
    return { allowed: false, reason: 'publisher is quarantined' };
  }
  if (policy.pinnedTag && !manifest.version.startsWith(policy.pinnedTag)) {
    return {
      allowed: false,
      reason: `pinned tag "${policy.pinnedTag}" does not match ${manifest.version}`,
    };
  }
  return { allowed: true, reason: 'ok' };
}
