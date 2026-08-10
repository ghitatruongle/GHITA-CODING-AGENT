// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 2: allowed-tools enforcement (P27)
// ==============================================================================
// Execution-boundary enforcement: when a skill declares `allowed-tools`, any
// adapter key outside the list is denied with a clear reason (deny-default).
// ==============================================================================

import type { SkillDefinition, SkillInvocation, SkillRuntimeAdapters } from '../types.js';
import type { SkillResult } from '@ghita/shared';

export interface DeniedTool {
  key: string;
  reason: string;
}

export interface ToolGateStats {
  denied: DeniedTool[];
  allowed: string[];
}

const ADAPTER_KEYS = ['file', 'terminal', 'screenshot', 'app'] as const;

/** Wrapper that denies access to adapters outside the allowed-tools list. */
export function createToolGate(
  adapters: SkillRuntimeAdapters,
  allowedTools: readonly string[] | undefined,
  onDeny?: (denied: DeniedTool) => void,
): { adapters: SkillRuntimeAdapters; stats: () => ToolGateStats } {
  const denied: DeniedTool[] = [];
  const allowed: string[] = [];

  if (!allowedTools || allowedTools.length === 0) {
    // No allowlist declared → no restriction (v2 default remains open like v1).
    return {
      adapters,
      stats: () => ({ denied, allowed }),
    };
  }

  const normalized = allowedTools.map((t) => t.toLowerCase());
  const gate = {} as SkillRuntimeAdapters;

  for (const key of ADAPTER_KEYS) {
    const adapter = adapters[key];
    if (!adapter) continue;
    if (normalized.includes(key)) {
      allowed.push(key);
      gate[key] = adapter;
    } else {
      gate[key] = undefined;
      denied.push({ key, reason: `tool "${key}" is not in allowed-tools allowlist` });
      onDeny?.({ key, reason: `tool "${key}" is not in allowed-tools allowlist` });
    }
  }

  // Preserve completion hook (not a tool).
  gate.onSkillComplete = adapters.onSkillComplete;

  return {
    adapters: gate,
    stats: () => ({ denied, allowed }),
  };
}

/** Guarded runner: enforces allowed-tools before the skill executes. */
export async function runSkillWithToolGate(
  registry: { get(id: string): SkillDefinition | undefined },
  id: string,
  invocation: SkillInvocation,
  baseAdapters: SkillRuntimeAdapters,
): Promise<{ result: SkillResult; denied: DeniedTool[] }> {
  const skill = registry.get(id);
  if (!skill) {
    return {
      result: { success: false, error: `Skill not found: ${id}` },
      denied: [],
    };
  }
  const gate = createToolGate(baseAdapters, skill.allowedTools);
  const result = await skill.run(invocation, {
    registry,
    adapters: gate.adapters,
    now: Date.now,
  });
  return { result, denied: gate.stats().denied };
}
