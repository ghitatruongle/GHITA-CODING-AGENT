// ==============================================================================
// v1.1.1 Track 8: native LCS diff-stat bridge (renderer → Tauri command)
// ==============================================================================
// `lineDiffStat` in editProposal.ts runs O(n·m) string DP on the UI thread —
// an AI edit touching two 5k-line files stalls the renderer in one burst.
// This wrapper resolves the same DiffStat through the Rust `line_diff_stat`
// command (spawn_blocking — off the UI thread) and falls back to the JS
// implementation when the command is unavailable (plain web dev, tests).
// ==============================================================================

import { invoke } from '@tauri-apps/api/core';
import { lineDiffStat, type DiffStat } from './editProposal';

/**
 * Async diff-stat, native-first. Falls back to the JS LCS on any failure
 * (missing command, non-Tauri host) — never rejects.
 */
export async function lineDiffStatNative(original: string, proposed: string): Promise<DiffStat> {
  try {
    return await invoke<DiffStat>('line_diff_stat_command', { original, proposed });
  } catch {
    return lineDiffStat(original, proposed);
  }
}
