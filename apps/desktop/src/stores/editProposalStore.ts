// ==============================================================================
// AI Edit Proposal store — reactive queue of pending edits awaiting review
// ==============================================================================
//
// Holds the AI-proposed edits so the CodeView can render a Monaco diff and let
// the user accept (write to disk) or reject them. The pure proposal-building
// logic lives in ../utils/editProposal.ts; this store only manages state.
// ==============================================================================

import { create } from 'zustand';
import {
  buildReplaceProposal,
  buildWriteProposal,
  type BuildProposalInput,
  type EditProposal,
} from '../utils/editProposal';

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
  /** The pending proposal for a given file path, if any. */
  getForPath: (path: string) => EditProposal | undefined;
  /** Remove a proposal by id (after accept/reject). */
  remove: (id: string) => void;
  /** Drop every pending proposal for a path (e.g. when the file is closed). */
  removeForPath: (path: string) => void;
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

  getForPath: (path) => get().proposals.find((p) => p.path === path && p.status === 'pending'),

  remove: (id) => set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) })),

  removeForPath: (path) => set((s) => ({ proposals: s.proposals.filter((p) => p.path !== path) })),

  clear: () => set({ proposals: [] }),
}));
