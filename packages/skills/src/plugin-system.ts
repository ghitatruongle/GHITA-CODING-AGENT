import type { SkillCategory, SkillResult } from '@ghita/shared';

// Manifest Types

export type PluginTrust = 'builtin' | 'verified' | 'community' | 'untrusted';

export type PluginState =
  | 'discovered'
  | 'validated'
  | 'loaded'
  | 'enabled'
  | 'disabled'
  | 'failed'
  | 'quarantined';

export interface PluginPermission {
  capability: string;
  constraints?: Record<string, unknown>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: SkillCategory;
  trust: PluginTrust;
  permissions: PluginPermission[];
  path: string;
  checksum?: string;
  homepage?: string;
  minHostVersion?: string;
  dependencies?: Record<string, string>;
}

export interface PluginRecord {
  manifest: PluginManifest;
  state: PluginState;
  lastError?: string;
  discoveredAt: number;
  updatedAt: number;
  invocationCount: number;
}

export interface PluginLoadHooks {
  onLoad?: (record: PluginRecord) => void | Promise<void>;
  onEnable?: (record: PluginRecord) => void | Promise<void>;
  onDisable?: (record: PluginRecord) => void | Promise<void>;
  onUnload?: (record: PluginRecord) => void | Promise<void>;
}

export interface PluginLoadResult {
  success: boolean;
  record?: PluginRecord;
  errors: string[];
}

export interface PluginImportFn {
  (manifest: PluginManifest): Promise<{
    run: (input: Record<string, unknown>) => Promise<SkillResult>;
    dispose?: () => Promise<void>;
  }>;
}

// Trust Policy

const PERMISSION_CATALOG: Record<
  string,
  { risk: 'low' | 'medium' | 'high'; needsApproval: boolean }
> = {
  'fs:read': { risk: 'low', needsApproval: false },
  'fs:write': { risk: 'medium', needsApproval: true },
  'net:http': { risk: 'medium', needsApproval: true },
  'shell:exec': { risk: 'high', needsApproval: true },
  'clipboard:read': { risk: 'low', needsApproval: false },
  'clipboard:write': { risk: 'medium', needsApproval: true },
  'os:env': { risk: 'medium', needsApproval: true },
  'browser:launch': { risk: 'high', needsApproval: true },
  'process:spawn': { risk: 'high', needsApproval: true },
};

const TRUST_MAX_RISK: Record<PluginTrust, 'low' | 'medium' | 'high'> = {
  builtin: 'high',
  verified: 'medium',
  community: 'low',
  untrusted: 'low',
};

const RISK_ORDER: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 1, high: 2 };

// Manifest Validation

const ID_RE = /^@?[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,63}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export interface ManifestValidationOptions {
  allowHighRisk?: boolean;
}

export function validateManifest(
  manifest: unknown,
  options: ManifestValidationOptions = {},
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const m = manifest as Partial<PluginManifest> | null | undefined;

  if (!m || typeof m !== 'object') {
    return { ok: false, errors: ['Manifest must be an object'] };
  }
  if (!m.id || typeof m.id !== 'string' || !ID_RE.test(m.id)) {
    errors.push(`Invalid id "${String(m.id)}"; expected "@scope/name" pattern`);
  }
  if (!m.version || typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) {
    errors.push(`Invalid version "${String(m.version)}"; must be SemVer`);
  }
  if (!m.name || typeof m.name !== 'string') errors.push('Missing name');
  if (!m.author || typeof m.author !== 'string') errors.push('Missing author');
  if (!m.description || typeof m.description !== 'string') errors.push('Missing description');
  if (!m.category || typeof m.category !== 'string') errors.push('Missing category');
  if (!m.path || typeof m.path !== 'string') errors.push('Missing path');
  if (m.trust && !['builtin', 'verified', 'community', 'untrusted'].includes(m.trust)) {
    errors.push(`Unknown trust level: ${String(m.trust)}`);
  }
  if (!Array.isArray(m.permissions)) {
    errors.push('permissions must be an array');
  } else {
    for (const p of m.permissions) {
      if (!p || typeof p !== 'object' || typeof p.capability !== 'string') {
        errors.push('Each permission must be an object with a string capability');
        continue;
      }
      const policy = PERMISSION_CATALOG[p.capability];
      if (!policy) {
        errors.push(`Unknown capability: ${p.capability}`);
        continue;
      }
      const maxRisk = TRUST_MAX_RISK[m.trust ?? 'community'];
      if (RISK_ORDER[policy.risk] > RISK_ORDER[maxRisk] && !options.allowHighRisk) {
        errors.push(
          `Permission "${p.capability}" (${policy.risk}) exceeds trust level max (${maxRisk})`,
        );
      }
    }
  }
  if (m.dependencies && typeof m.dependencies !== 'object') {
    errors.push('dependencies must be an object map');
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// Plugin Manager

export class PluginManager {
  private records = new Map<string, PluginRecord>();
  private disposers = new Map<string, () => Promise<void>>();
  private readonly hooks: PluginLoadHooks;

  constructor(hooks: PluginLoadHooks = {}) {
    this.hooks = hooks;
  }

  list(): PluginRecord[] {
    return Array.from(this.records.values()).sort((a, b) =>
      a.manifest.name.localeCompare(b.manifest.name),
    );
  }

  get(id: string): PluginRecord | undefined {
    return this.records.get(id);
  }

  register(manifest: PluginManifest): PluginRecord {
    const now = Date.now();
    const existing = this.records.get(manifest.id);
    if (existing) {
      existing.manifest = manifest;
      existing.updatedAt = now;
      return existing;
    }
    const record: PluginRecord = {
      manifest,
      state: 'discovered',
      discoveredAt: now,
      updatedAt: now,
      invocationCount: 0,
    };
    this.records.set(manifest.id, record);
    return record;
  }

  async load(
    manifest: PluginManifest,
    importPlugin: PluginImportFn,
    options: ManifestValidationOptions = {},
  ): Promise<PluginLoadResult> {
    const validation = validateManifest(manifest, options);
    if (!validation.ok) {
      return { success: false, errors: validation.errors };
    }
    const record = this.register(manifest);
    record.state = 'validated';
    record.lastError = undefined;
    record.updatedAt = Date.now();

    try {
      const mod = await importPlugin(manifest);
      if (typeof mod.run !== 'function') {
        throw new Error('Plugin module did not export a run() function');
      }
      if (mod.dispose) this.disposers.set(manifest.id, mod.dispose);
      record.state = 'loaded';
      record.updatedAt = Date.now();
      await this.hooks.onLoad?.(record);
      return { success: true, record, errors: [] };
    } catch (err) {
      record.state = 'failed';
      record.lastError = err instanceof Error ? err.message : String(err);
      record.updatedAt = Date.now();
      return { success: false, record, errors: [record.lastError] };
    }
  }

  async enable(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return false;
    if (record.state !== 'loaded' && record.state !== 'disabled') return false;
    record.state = 'enabled';
    record.updatedAt = Date.now();
    await this.hooks.onEnable?.(record);
    return true;
  }

  async disable(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return false;
    if (record.state !== 'enabled' && record.state !== 'loaded') return false;
    record.state = 'disabled';
    record.updatedAt = Date.now();
    await this.hooks.onDisable?.(record);
    return true;
  }

  async quarantine(id: string, reason: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return false;
    record.state = 'quarantined';
    record.lastError = reason;
    record.updatedAt = Date.now();
    return true;
  }

  async unload(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return false;
    const disposer = this.disposers.get(id);
    if (disposer) {
      try {
        await disposer();
      } catch {
        record.lastError = 'dispose() threw';
      }
      this.disposers.delete(id);
    }
    this.records.delete(id);
    await this.hooks.onUnload?.(record);
    return true;
  }

  recordInvocation(id: string): void {
    const record = this.records.get(id);
    if (record) record.invocationCount += 1;
  }
}

export { PERMISSION_CATALOG, TRUST_MAX_RISK };
