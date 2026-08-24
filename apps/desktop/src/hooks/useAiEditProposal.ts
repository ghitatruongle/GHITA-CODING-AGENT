// useAiEditProposal — wires the AI edit-proposal store into a code view

//
// Encapsulates the "AI proposes an edit → review a Monaco diff → accept/reject"
// behaviour: exposing the active proposal, applying it to disk on accept, and
// auto-surfacing a newly-arrived proposal by opening/focusing its file.
//
// v1.0.0 — two proposal sources:
//  1. LOCAL  (chat "Apply" button): accept writes the file directly via the
//     native fs commands.
//  2. REMOTE (Antigravity gate — the running agent paused on a write_file /
//     replace_file_content call): accept/reject is answered back to the
//     sidecar via `edit_proposal_response`; the sidecar performs the actual
//     write + checkpoint and broadcasts `edit_applied`.

import { useCallback, useEffect, useRef } from 'react';
import { fsWriteText, fsReadText } from '../lib/native-fs';
import toast from 'react-hot-toast';
import { fileContentCache, useAppStore } from '../stores/appStore';
import { useEditProposalStore } from '../stores/editProposalStore';
import { getSharedSocket } from '../utils/sharedSocket';
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

/**
 * Answer a remote (agent-side) proposal through the shared socket.
 *

 * Returns 'ok' when the sidecar still had the proposal and handled it, 'stale'
 * when the proposal is gone (run ended / 5-min timeout — the file was NOT
 * written), or 'offline' when there is no socket. Callers must not optimistically
 * mark a file saved unless we get 'ok'.
 */
export type RemoteResponse = 'ok' | 'stale' | 'offline';

export async function respondRemote(remoteId: string, accepted: boolean): Promise<RemoteResponse> {
  try {
    const socket = await getSharedSocket();
    if (!socket) return 'offline';
    return await new Promise<RemoteResponse>((resolve) => {
      const timer = setTimeout(() => resolve('stale'), 3000);
      socket.emit(
        'edit_proposal_response',
        { proposalId: remoteId, accepted },
        (res: { ok?: boolean; reason?: string } | undefined) => {
          clearTimeout(timer);
          resolve(res?.ok === true ? 'ok' : 'stale');
        },
      );
    });
  } catch {
    return 'offline';
  }
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

    // ---- Remote proposal (Antigravity gate): the sidecar owns the write ----
    if (activeProposal.remoteId) {
      const res = await respondRemote(activeProposal.remoteId, true);
      
      // unless the sidecar confirmed it still had the proposal.
      if (res !== 'ok') {
        removeProposal(activeProposal.id);
        if (res === 'stale') {
          toast.error(t('codeView.editStale'));
        } else {
          toast.error(t('codeView.saveFailed', { error: 'Sidecar server is not connected.' }));
        }
        return;
      }
      // Optimistically show the proposed content; `edit_applied` will re-read
      // the authoritative bytes from disk and refresh the cache.
      fileContentCache.set(activeProposal.path, {
        content: activeProposal.proposedContent,
        originalContent: activeProposal.proposedContent,
        hydrated: true,
      });
      setOpenFiles(
        useAppStore
          .getState()
          .codeOpenFiles.map((f) =>
            f.path === activeProposal.path ? { ...f, modified: false } : f,
          ),
      );
      removeProposal(activeProposal.id);
      toast.success(t('codeView.editApplied', { name: activeProposal.fileName }));
      return;
    }

    // ---- Local proposal: write to disk directly (v0.8.0 hardened flow) ----

    // Safety: never silently discard the user's own unsaved edits. The diff
    // review shows the AI's version as the new content — if the file has
    // manually-applied, unsaved edits indicating the working copy diverged from
    // the proposal's originalContent, ask first instead of overwriting.
    const cache = fileContentCache.get(activeProposal.path);
    const currentInMemory = cache?.content;
    const workingCopyIsClean =
      currentInMemory === undefined ||
      currentInMemory === activeProposal.originalContent ||
      cache?.hydrated === false;
    if (!workingCopyIsClean) {
      const ok = window.confirm(
        t('codeView.unsavedEditsProposalConfirm', {
          name: activeProposal.fileName,
        }),
      );
      if (!ok) return;
    }

    // oversized file even via the AI proposal path. handleSave already guards
    // direct write; this is the same guard for the proposal flow.
    if (cache?.isTruncated) {
      toast.error(t('codeView.fileTooLargeToSave', { name: activeProposal.fileName }));
      return;
    }

    try {
      
      // (1) If `cache?.encoding` is unknown we MUST learn it or a naive UTF-8
      //     write would corrupt a UTF-16/BOM/latin-1 file.
      // (2) TOCTOU: an external editor (or another agent run) may have
      //     changed the file since the proposal was created. If the disk
      //     content no longer matches the proposal's originalContent, abort
      //     instead of clobbering the new content.
      let disk;
      try {
        disk = await fsReadText(activeProposal.path);
      } catch (readErr) {
        // New-file proposals legitimately have nothing on disk yet.
        if (activeProposal.isNewFile) {
          disk = { content: '', encoding: 'utf-8', isBinary: false, isTruncated: false };
        } else {
          toast.error(
            t('codeView.saveFailed', {
              error: readErr instanceof Error ? readErr.message : String(readErr),
            }),
          );
          return;
        }
      }
      if (disk.isBinary) {
        toast.error(t('codeView.saveFailed', { error: 'The target file is binary.' }));
        return;
      }
      if (!activeProposal.isNewFile && disk.content !== activeProposal.originalContent) {
        toast.error(
          t('codeView.saveFailed', {
            error:
              'File changed on disk since the proposal was created. Please re-create the proposal.',
          }),
        );
        return;
      }
      const encoding = cache?.encoding ?? disk.encoding;
      await fsWriteText(activeProposal.path, activeProposal.proposedContent, encoding);
      fileContentCache.set(activeProposal.path, {
        content: activeProposal.proposedContent,
        originalContent: activeProposal.proposedContent,
        encoding,
        hydrated: true,
      });
      setOpenFiles(
        
        // store, not the closure snapshot. Otherwise an onChange that
        // arrives a tick after a tab close can write the old array (with
        // the just-closed tab) back into the store, resurrecting it.
        useAppStore
          .getState()
          .codeOpenFiles.map((f) =>
            f.path === activeProposal.path ? { ...f, modified: false } : f,
          ),
      );
      removeProposal(activeProposal.id);
      toast.success(t('codeView.editApplied', { name: activeProposal.fileName }));
    } catch (e) {
      toast.error(t('codeView.saveFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
    // deep-review fix (BUG-7): `openFiles` is only used to seed the surface
    // effect below, not here — the store read above is the source of truth,
    // so listing it in the deps just caused needless re-creations.
  }, [activeProposal, setOpenFiles, removeProposal, t]);

  const rejectProposal = useCallback(() => {
    if (!activeProposal) return;
    if (activeProposal.remoteId) {
      // Reject is safe to fire-and-forget: the proposal is removed locally
      // either way, and the sidecar handles stale ids gracefully.
      void respondRemote(activeProposal.remoteId, false);
    }
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
          hydrated: true,
        });
      }
      
      // instead of the closure snapshot, to avoid resurrecting a tab that was
      // closed between the time this effect closed over `openFiles` and the
      // time it ran.
      setOpenFiles([
        ...useAppStore.getState().codeOpenFiles,
        { path: newest.path, name: newest.fileName, language: newest.language, modified: false },
      ]);
    }
    setActivePath(newest.path);
  }, [proposals, openFiles, setOpenFiles, setActivePath]);

  return { activeProposal, acceptProposal, rejectProposal };
}
