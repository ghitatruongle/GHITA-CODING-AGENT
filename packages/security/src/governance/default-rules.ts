// ==============================================================================
// v0.4.9 A2: Agent Governance — Default Policy Rules
//
// Baseline deny-default rule set for the GHITA agent runtime. These pair with
// the terminal blacklist in .ghita/security-blacklist.yaml to block the most
// destructive tool-calls before they reach an adapter.
// ==============================================================================

import type { PolicyRule } from './types.js';

/**
 * Bộ rule mặc định. PolicyEngine chạy deny-default nên mọi thứ không được
 * allow tường minh sẽ bị chặn; các rule deny dưới đây là "chốt chặn cứng"
 * có priority cao để không allow rule nào ghi đè được.
 */
export const DEFAULT_POLICY_RULES: PolicyRule[] = [
  // ── Hard denials (priority 100) ─────────────────────────────────────────
  {
    id: 'deny-destructive-shell',
    effect: 'deny',
    tool: 'terminal.*',
    action: 'execute',
    resourcePattern:
      /\b(?:rm\s+-rf\s+\/|mkfs|dd\s+if=|:\(\)\s*\{|format\s+[a-z]:|del\s+\/[sfq])/i,
    priority: 100,
    reason: 'Destructive shell command blocked by governance policy.',
  },
  {
    id: 'deny-fs-write-outside-workspace',
    effect: 'deny',
    tool: 'fs.*',
    action: 'write',
    resourcePattern: /^(?:\/etc\/|\/usr\/|\/bin\/|[A-Za-z]:\\Windows\\|\/System\/)/,
    priority: 100,
    reason: 'Writing to a system path is not permitted.',
  },
  {
    id: 'deny-fs-delete-outside-workspace',
    effect: 'deny',
    tool: 'fs.*',
    action: 'delete',
    resourcePattern: /^(?:\/etc\/|\/usr\/|\/bin\/|[A-Za-z]:\\Windows\\|\/System\/)/,
    priority: 100,
    reason: 'Deleting a system path is not permitted.',
  },

  // ── Explicit allowances (priority 10) ───────────────────────────────────
  {
    id: 'allow-fs-read',
    effect: 'allow',
    tool: 'fs.*',
    action: 'read',
    priority: 10,
    reason: 'Reading files is allowed within the workspace scope.',
  },
  {
    id: 'allow-fs-write-workspace',
    effect: 'allow',
    tool: 'fs.*',
    action: 'write',
    resourcePattern: /(?:ghita-workspace|[/\\]workspace[/\\])/,
    priority: 10,
    reason: 'Writing inside the workspace is allowed.',
  },
  {
    id: 'allow-browser-readonly',
    effect: 'allow',
    tool: 'browser.*',
    action: 'read',
    priority: 10,
    reason: 'Read-only browser observation is allowed.',
  },
  {
    id: 'allow-terminal-safe',
    effect: 'allow',
    tool: 'terminal.*',
    action: 'execute',
    resourcePattern: /^(?:git|pnpm|npm|node|tsc|vitest|eslint|ls|cat|pwd|echo)\b/,
    priority: 10,
    reason: 'Whitelisted development command.',
  },
];
