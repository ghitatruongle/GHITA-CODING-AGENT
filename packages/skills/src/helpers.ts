// ==============================================================================
// GHITA CODING AGENT - Skills Helpers
// ==============================================================================
// Shared helper functions for skill implementations.
// Extracted from index.ts for reuse across skill modules.
// ==============================================================================

import type { SkillResult } from '@ghita/shared';

/** Create a successful skill result. */
export function ok(output: string, data?: unknown): SkillResult {
  return { success: true, output, data };
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
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
  return typeof value === 'boolean' ? value : undefined;
}

/** Escape a shell argument for safe command-line usage. */
export function escapeShellArg(arg: string): string {
  if (process.platform === 'win32') {
    // Windows CMD: escape special characters & | ^ % ( ) < > ! and double quotes
    // Also escape backslashes before quotes
    const escaped = arg
      .replace(/\\/g, '\\\\') // Backslashes first
      .replace(/"/g, '""') // Double quotes
      .replace(/&/g, '^&') // Ampersand
      .replace(/\|/g, '^|') // Pipe
      .replace(/\^/g, '^^') // Caret (must be before other escapes)
      .replace(/%/g, '%%') // Percent
      .replace(/\(/g, '^(') // Open paren
      .replace(/\)/g, '^)') // Close paren
      .replace(/</g, '^<') // Less than
      .replace(/>/g, '^>') // Greater than
      .replace(/!/g, '^!'); // Exclamation (for delayed expansion)
    return `"${escaped}"`;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** Escape a string for safe usage in PowerShell commands. */
export function escapePowerShellString(arg: string): string {
  return `'${arg.replace(/'/g, "''")}'`;
}

/** Return a skill result indicating a missing adapter. */
export function missingAdapter(name: string): SkillResult {
  return fail(`${name} adapter is not available in this runtime.`);
}
