// ==============================================================================
// AI Edit Proposal engine — pure, framework-agnostic logic
//
// Powers the "AI proposes an edit → user reviews a Monaco diff → accept/reject"
// flow (Cursor/Antigravity-style). This module is intentionally free of React
// and Tauri so it can be unit-tested in isolation; the store + view layers on
// top of it perform the reactive state + real file writes.
// ==============================================================================

export type EditProposalStatus = 'pending' | 'accepted' | 'rejected';

export interface EditProposal {
  id: string;
  /** Absolute file path the edit targets. */
  path: string;
  fileName: string;
  language: string;
  /** File content BEFORE the edit (left side of the diff). */
  originalContent: string;
  /** File content AFTER the edit (right side of the diff). */
  proposedContent: string;
  /** Optional human/AI explanation of the change. */
  description?: string;
  status: EditProposalStatus;
  createdAt: number;
}

/** Result of trying to build a proposal from a targeted replacement. */
export type ProposalResult = { ok: true; proposedContent: string } | { ok: false; error: string };

/**
 * Apply a single unique contiguous replacement to `original`, mirroring the
 * agent's `replace_file_content` tool semantics: the target must exist exactly
 * once, otherwise the edit is rejected (prevents wrong-location edits).
 */
export function applyReplace(
  original: string,
  targetContent: string,
  replacementContent: string,
): ProposalResult {
  if (targetContent.length === 0) {
    return { ok: false, error: 'Target content must not be empty.' };
  }
  const first = original.indexOf(targetContent);
  if (first === -1) {
    return { ok: false, error: 'Target content not found in the file.' };
  }
  const last = original.lastIndexOf(targetContent);
  if (first !== last) {
    return {
      ok: false,
      error: 'Target content appears multiple times — provide a more unique block.',
    };
  }
  const proposedContent =
    original.slice(0, first) + replacementContent + original.slice(first + targetContent.length);
  return { ok: true, proposedContent };
}

export interface DiffStat {
  added: number;
  removed: number;
  /** True when proposed content is identical to the original. */
  unchanged: boolean;
}

/**
 * Compute added/removed line counts between two texts using an LCS of lines.
 * Deterministic and dependency-free — good enough for a diff summary badge.
 */
export function lineDiffStat(original: string, proposed: string): DiffStat {
  if (original === proposed) return { added: 0, removed: 0, unchanged: true };
  const a = original.split('\n');
  const b = proposed.split('\n');
  const lcs = lcsLength(a, b);
  return { added: b.length - lcs, removed: a.length - lcs, unchanged: false };
}

/** Length of the longest common subsequence of two line arrays. */
function lcsLength(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  // Rolling 1-D DP to keep memory at O(m).
  let prev = new Array<number>(m + 1).fill(0);
  let curr = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      curr[j] =
        a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[m] ?? 0;
}

let proposalCounter = 0;

/** Generate a stable-ish unique proposal id (no crypto dependency needed). */
export function newProposalId(): string {
  proposalCounter += 1;
  return `edit_${Date.now().toString(36)}_${proposalCounter}`;
}

export interface BuildProposalInput {
  path: string;
  fileName: string;
  language: string;
  originalContent: string;
  description?: string;
}

/** Build a whole-file (write) proposal. */
export function buildWriteProposal(
  input: BuildProposalInput,
  proposedContent: string,
): EditProposal {
  return {
    id: newProposalId(),
    path: input.path,
    fileName: input.fileName,
    language: input.language,
    originalContent: input.originalContent,
    proposedContent,
    description: input.description,
    status: 'pending',
    createdAt: Date.now(),
  };
}

/**
 * Build a replacement (targeted edit) proposal, or return an error when the
 * target block cannot be uniquely located.
 */
export function buildReplaceProposal(
  input: BuildProposalInput,
  targetContent: string,
  replacementContent: string,
): { ok: true; proposal: EditProposal } | { ok: false; error: string } {
  const result = applyReplace(input.originalContent, targetContent, replacementContent);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, proposal: buildWriteProposal(input, result.proposedContent) };
}
