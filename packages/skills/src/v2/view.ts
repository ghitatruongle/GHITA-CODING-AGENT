// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 2: v2 view wiring (P36)
// ==============================================================================
// Data-layer wiring for the desktop Skills view: renders each skill as a row
// with v2 metadata (version, license, allowed-tools, sandbox, lock status).
// ==============================================================================

import type { SkillDefinition } from '../types.js';

export interface SkillViewRow {
  id: string;
  name: string;
  version: string;
  category: string;
  license: string;
  allowedTools: string;
  sandbox: 'default' | 'require_escalated' | '—';
  internal: boolean;
  enabled: boolean;
  lock: 'locked' | 'unlocked' | '—';
}

export interface LockLookup {
  (id: string): { locked: boolean } | undefined;
}

/** Build the view-model rows consumed by the desktop Skills view. */
export function toSkillListView(
  skills: readonly SkillDefinition[],
  lockLookup?: LockLookup,
): SkillViewRow[] {
  return skills.map((s) => {
    const lock = lockLookup?.(s.id);
    return {
      id: s.id,
      name: s.name,
      version: s.metadata?.version ?? s.version,
      category: s.category,
      license: s.license ?? '—',
      allowedTools: s.allowedTools?.length ? s.allowedTools.join(', ') : '—',
      sandbox: s.sandboxPermissions ?? '—',
      internal: Boolean(s.metadata?.internal),
      enabled: s.enabled,
      lock: lock ? (lock.locked ? 'locked' : 'unlocked') : '—',
    };
  });
}
