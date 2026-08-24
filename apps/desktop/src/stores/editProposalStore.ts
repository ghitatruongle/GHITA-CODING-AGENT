// AI Edit Proposal store — reactive queue of pending edits awaiting review

//
// Holds the AI-proposed edits so the CodeView can render a Monaco diff and let
// the user accept (write to disk) or reject them. The pure proposal-building
// logic lives in ../utils/editProposal.ts; this store only manages state.

import { create } from 'zustand';
import {
  buildReplaceProposal,
  buildWriteProposal,
  newProposalId,
  type BuildProposalInput,
  type EditProposal,
} from '../utils/editProposal.ts';

/** Payload pushed by the sidecar's Antigravity edit-review gate. */
export interface RemoteEditProposalPayload {
  proposalId: string;
  runId?: string;
  kind: 'write_file' | 'replace_file_content';
  path: string;
  relPath: string;
  fileName: string;
  language: string;
  originalContent: string;
  proposedContent: string;
  isNewFile: boolean;
  createdAt?: number;
}

interface EditProposalState {
  proposals: EditProposal[];
  /** Push a whole-file proposal; returns its id. */
  proposeWrite: (input: BuildProposalInput, proposedContent: string) => string;
  /**
   * Push a targeted-replacement proposal. Returns the id on success or an
   * error string when the target block can't be uniquely located.
   */
  proposeReplace: (
    input: BuildProposalInput,
    targetContent: string,
    replacementContent: string,
  ) => { ok: true; id: string } | { ok: false; error: string };
  /**
   * v1.0.0 — register a proposal emitted by the running agent (Antigravity
   * gate). Accept/reject for these must be answered back to the sidecar.
   */
  proposeRemote: (payload: RemoteEditProposalPayload) => string;
  /** The pending proposal for a given file path, if any. */
  getForPath: (path: string) => EditProposal | undefined;
  /** Remove a proposal by id (after accept/reject). */
  remove: (id: string) => void;
  /** Drop every pending proposal for a path (e.g. when the file is closed). */
  removeForPath: (path: string) => void;
  /** Remove every proposal belonging to an agent run (e.g. run aborted). */
  removeForRun: (runId: string) => void;
  clear: () => void;
}

export const useEditProposalStore = create<EditProposalState>((set, get) => ({
  proposals: [],

  proposeWrite: (input, proposedContent) => {
    const proposal = buildWriteProposal(input, proposedContent);
    // Replace any existing pending proposal for the same path (latest wins).
    set((s) => ({
      proposals: [...s.proposals.filter((p) => p.path !== input.path), proposal],
    }));
    return proposal.id;
  },

  proposeReplace: (input, targetContent, replacementContent) => {
    const result = buildReplaceProposal(input, targetContent, replacementContent);
    if (!result.ok) return result;
    set((s) => ({
      proposals: [...s.proposals.filter((p) => p.path !== input.path), result.proposal],
    }));
    return { ok: true, id: result.proposal.id };
  },

  proposeRemote: (payload) => {
    
    // (network retry / duplicate broadcast). Re-answering one remoteId twice
    // would otherwise leave an orphaned row that can never be applied.
    const existing = get().proposals.find((p) => p.remoteId === payload.proposalId);
    if (existing) return existing.id;
    const proposal: EditProposal = {
      id: newProposalId(),
      path: payload.path,
      fileName: payload.fileName,
      language: payload.language,
      originalContent: payload.originalContent,
      proposedContent: payload.proposedContent,
      description: payload.isNewFile
        ? `New file (${payload.relPath})`
        : `Agent edit (${payload.relPath})`,
      status: 'pending',
      createdAt: payload.createdAt ?? Date.now(),
      remoteId: payload.proposalId,
      runId: payload.runId,
      isNewFile: payload.isNewFile,
    };
    set((s) => ({
      proposals: [...s.proposals.filter((p) => p.path !== payload.path), proposal],
    }));
    return proposal.id;
  },

  getForPath: (path) => get().proposals.find((p) => p.path === path && p.status === 'pending'),

  remove: (id) => set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) })),

  removeForPath: (path) => set((s) => ({ proposals: s.proposals.filter((p) => p.path !== path) })),

  removeForRun: (runId) =>
    set((s) => ({ proposals: s.proposals.filter((p) => p.runId !== runId) })),

  clear: () => set({ proposals: [] }),
}));
