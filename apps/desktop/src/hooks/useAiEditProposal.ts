// ==============================================================================
// useAiEditProposal — wires the AI edit-proposal store into a code view
// ==============================================================================
//
// Encapsulates the "AI proposes an edit → review a Monaco diff → accept/reject"
// behaviour: exposing the active proposal, applying it to disk on accept, and
// auto-surfacing a newly-arrived proposal by opening/focusing its file.
// ==============================================================================

import { useCallback, useEffect, useRef } from 'react';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import toast from 'react-hot-toast';
import { fileContentCache } from '../stores/appStore';
import { useEditProposalStore } from '../stores/editProposalStore';
import type { EditProposal } from '../utils/editProposal';

export interface OpenFileEntry {
  path: string;
  name: string;
  language: string;
  modified: boolean;
}

interface UseAiEditProposalParams {
  activePath: string;
  openFiles: OpenFileEntry[];
  setOpenFiles: (files: OpenFileEntry[]) => void;
  setActivePath: (path: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

interface UseAiEditProposalResult {
  activeProposal: EditProposal | undefined;
  acceptProposal: () => Promise<void>;
  rejectProposal: () => void;
}

export function useAiEditProposal({
  activePath,
  openFiles,
  setOpenFiles,
  setActivePath,
  t,
}: UseAiEditProposalParams): UseAiEditProposalResult {
  const proposals = useEditProposalStore((s) => s.proposals);
  const removeProposal = useEditProposalStore((s) => s.remove);
  const lastSurfacedProposalId = useRef<string | null>(null);

  const activeProposal = activePath
    ? proposals.find((p) => p.path === activePath && p.status === 'pending')
    : undefined;

  const acceptProposal = useCallback(async () => {
    if (!activeProposal) return;
    try {
      await writeTextFile(activeProposal.path, activeProposal.proposedContent);
      fileContentCache.set(activeProposal.path, {
        content: activeProposal.proposedContent,
        originalContent: activeProposal.proposedContent,
      });
      setOpenFiles(
        openFiles.map((f) => (f.path === activeProposal.path ? { ...f, modified: false } : f)),
      );
      removeProposal(activeProposal.id);
      toast.success(t('codeView.editApplied', { name: activeProposal.fileName }));
    } catch (e) {
      toast.error(
        t('codeView.saveFailed', { error: e instanceof Error ? e.message : String(e) }),
      );
    }
  }, [activeProposal, openFiles, setOpenFiles, removeProposal, t]);

  const rejectProposal = useCallback(() => {
    if (!activeProposal) return;
    removeProposal(activeProposal.id);
    toast(t('codeView.editRejected', { name: activeProposal.fileName }));
  }, [activeProposal, removeProposal, t]);

  // When a new proposal arrives, open + focus its file so the diff is visible.
  useEffect(() => {
    const pending = proposals.filter((p) => p.status === 'pending');
    const newest = pending[pending.length - 1];
    if (!newest || newest.id === lastSurfacedProposalId.current) return;
    lastSurfacedProposalId.current = newest.id;
    const existing = openFiles.find((f) => f.path === newest.path);
    if (!existing) {
      if (!fileContentCache.has(newest.path)) {
        fileContentCache.set(newest.path, {
          content: newest.originalContent,
          originalContent: newest.originalContent,
        });
      }
      setOpenFiles([
        ...openFiles,
        { path: newest.path, name: newest.fileName, language: newest.language, modified: false },
      ]);
    }
    setActivePath(newest.path);
  }, [proposals, openFiles, setOpenFiles, setActivePath]);

  return { activeProposal, acceptProposal, rejectProposal };
}
