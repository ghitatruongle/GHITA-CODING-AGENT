// ==============================================================================
// GHITA CODING AGENT — Model Label Formatting Utilities
// ==============================================================================
// Convert between the canonical API model name (as provided by the upstream
// provider) and the display label shown in the UI.
//
// Some free providers (e.g. OpenCode Zen) ship model names that mix lower
// case, upper case, and whitespace ("DeepSeek V4 Flash Free"). To keep the
// UI consistent we normalize the label to upper-case + dashes
// ("DEEPSEEK-V4-FLASH-FREE"). The reverse direction is needed when the user
// picks a value from a dropdown / datalist and we must recover the original
// API name for outbound requests.
// ==============================================================================

/** Map of provider IDs that have a non-trivial model label transformation. */
const FORMATTED_PROVIDER_IDS = new Set<string>(['opencode-zen', 'nvidia-nim']);

/** Convert an API model name to the display label shown in the UI. */
export function formatModelLabel(providerId: string, apiName: string): string {
  if (!FORMATTED_PROVIDER_IDS.has(providerId)) return apiName;
  return apiName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Convert a display label back to the canonical API model name.
 *
 * - If the label matches an entry in `availableApiNames` after a
 *   case/dash/whitespace-insensitive comparison, the original (case-preserved)
 *   API name is returned.
 * - Otherwise the label is returned unchanged so users can still type custom
 *   model names that are not in the preset list.
 */
export function parseModelLabel(
  providerId: string,
  displayLabel: string,
  availableApiNames: string[],
): string {
  if (!FORMATTED_PROVIDER_IDS.has(providerId)) return displayLabel;
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .trim();
  const target = normalize(displayLabel);
  if (!target) return displayLabel;
  const hit = availableApiNames.find((m) => normalize(m) === target);
  return hit ?? displayLabel;
}
