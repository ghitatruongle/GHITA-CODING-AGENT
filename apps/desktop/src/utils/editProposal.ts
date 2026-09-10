// AI Edit Proposal engine — pure, framework-agnostic logic
//
// Powers the "AI proposes an edit → user reviews a Monaco diff → accept/reject"
// flow (Cursor/Antigravity-style). This module is intentionally free of React
// and Tauri so it can be unit-tested in isolation; the store + view layers on
// top of it perform the reactive state + real file writes.

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
  /**
   * v1.0.0 — Antigravity gate: when set, this proposal came from the agent's
   * live tool call; accepting/rejecting must answer the sidecar via
   * `edit_proposal_response` (the sidecar performs the actual write +
   * checkpoint). Local-only proposals (chat "Apply" button) have no remoteId
   * and are written to disk directly by the frontend.
   */
  remoteId?: string;
  /** Agent run that produced this proposal (remote proposals only). */
  runId?: string;
  /** True when the target file did not exist before the edit. */
  isNewFile?: boolean;
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
  const normalizedOriginal = original.replace(/\r\n/g, '\n');
  const normalizedProposed = proposed.replace(/\r\n/g, '\n');
  if (normalizedOriginal === normalizedProposed) return { added: 0, removed: 0, unchanged: true };
  const a = normalizedOriginal.split('\n');
  const b = normalizedProposed.split('\n');
  const lcs = lcsLength(a, b);
  return { added: b.length - lcs, removed: a.length - lcs, unchanged: false };
}

/**
 * Length of the longest common subsequence of two line arrays.
 * v1.2.0-demo1: common prefix/suffix trim + Hunt–Szymanski (LIS over match
 * positions) — O((n + r) log L) instead of the old O(n·m) rolling DP, where
 * r is the number of equal-line pairs. Output is identical to the DP (golden
 * test: editProposal.lcs-golden.test.ts); realistic edits drop from ~1.1s to
 * single-digit ms on 5k-line files.
 */
function lcsLength(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;

  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  if (prefix === n || prefix === m) return prefix;

  let suffix = 0;
  while (
    suffix < n - prefix &&
    suffix < m - prefix &&
    a[n - 1 - suffix] === b[m - 1 - suffix]
  )
    suffix++;

  const aStart = prefix;
  const aEnd = n - suffix;
  const bStart = prefix;
  const bEnd = m - suffix;
  if (aEnd <= aStart || bEnd <= bStart) return prefix + suffix;

  // Hunt–Szymanski: for each middle line of `a`, walk its matching positions
  // in `b` (descending, so one `a` element can't extend the same run twice)
  // through a patience-sort LIS on the position sequence.
  const positions = new Map<string, number[]>();
  for (let j = bEnd - 1; j >= bStart; j--) {
    const line = b[j] as string;
    const arr = positions.get(line);
    if (arr) arr.push(j);
    else positions.set(line, [j]);
  }

  const tails: number[] = [];
  for (let i = aStart; i < aEnd; i++) {
    const arr = positions.get(a[i] as string);
    if (!arr) continue;
    for (const j of arr) {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((tails[mid] as number) < j) lo = mid + 1;
        else hi = mid;
      }
      if (lo === tails.length) tails.push(j);
      else tails[lo] = j;
    }
  }
  return prefix + suffix + tails.length;
}

let proposalCounter = 0;

/** Generate a unique proposal id (collision-safe across reloads). */
export function newProposalId(): string {
  try {
    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : null;
    if (uuid) return `edit_${uuid}`;
  } catch {
    // fall through to counter fallback
  }
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
