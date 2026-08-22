// ==============================================================================
// GHITA CODING AGENT - Skills Helpers
// ==============================================================================
// Shared helper functions for skill implementations.
// Extracted from index.ts for reuse across skill modules.
// ==============================================================================

import type { SkillResult } from '@ghita/shared';

/** Create a successful skill result. */
export function ok(output: string, data?: unknown): SkillResult {
  return { success: true, output, data: data !== undefined ? data : output };
}

/** Create a failed skill result. */
export function fail(error: string, data?: unknown): SkillResult {
  return { success: false, error, data };
}

/** Read a string value from a parameter map. */
export function readString(
  input: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = input?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Read a numeric value from a parameter map. */
export function readNumber(
  input: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = input?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

/** Read a string array from a parameter map. */
export function readStringArray(
  input: Record<string, unknown> | undefined,
  key: string,
): string[] | undefined {
  const value = input?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : undefined;
}

/** Read a boolean value from a parameter map. */
export function readBoolean(
  input: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = input?.[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  return undefined;
}

/** Escape a shell argument for safe command-line usage. */
export function escapeShellArg(arg: string): string {
  if (!arg) return "''";
  // Strip backtick subcommands and $() subcommands for safety
  const sanitized = arg.replace(/`[^`]*`/g, '').replace(/\$\([^)]*\)/g, '');
  // Wrap in single quotes, escaping any internal single quotes
  return `'${sanitized.replace(/'/g, "'\\''")}'`;
}

/** Escape a string for safe usage in PowerShell commands. */
export function escapePowerShellString(arg: string): string {
  if (!arg) return "''";
  return `'${arg.replace(/'/g, "''")}'`;
}

/** Return a skill result indicating a missing adapter. */
export function missingAdapter(name: string): SkillResult {
  return fail(`${name} adapter is not available in this runtime.`);
}
