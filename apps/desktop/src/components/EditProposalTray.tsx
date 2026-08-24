// Floating queue of every pending AI edit proposal (agent run + chat "Apply").
// Each row shows the file, +/- line stats and jumps to the diff on click.
// Accept All / Reject All batch-answer both remote (agent-gate) and local
// proposals so a multi-file agent run can be reviewed in one place.

import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '../i18n';
import { fileContentCache, useAppStore } from '../stores/appStore';
import { useEditProposalStore } from '../stores/editProposalStore';
import { respondRemote } from '../hooks/useAiEditProposal';
import { type EditProposal } from '../utils/editProposal';
import { fsWriteText } from '../lib/native-fs';
import { DiffStatBadge } from './DiffStatBadge';

interface EditProposalTrayProps {
  /** Path currently shown in the editor (its proposal renders inline there). */
  activePath: string;
  onJumpTo: (path: string) => void;
}

/** Apply a LOCAL proposal to disk (remote ones are written by the sidecar). */
async function applyLocalProposal(p: EditProposal): Promise<void> {
  const cache = fileContentCache.get(p.path);
  if (cache?.isTruncated) {
    throw new Error(`"${p.fileName}" is truncated — save disabled.`);
  }
  const encoding = cache?.encoding ?? undefined;
  await fsWriteText(p.path, p.proposedContent, encoding);
  fileContentCache.set(p.path, {
    content: p.proposedContent,
    originalContent: p.proposedContent,
    encoding,
    hydrated: true,
  });
}

export function EditProposalTray({ activePath, onJumpTo }: EditProposalTrayProps) {
  const { t } = useTranslation();
  const proposals = useEditProposalStore((s) => s.proposals);
  const removeProposal = useEditProposalStore((s) => s.remove);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);

  const pending = useMemo(() => proposals.filter((p) => p.status === 'pending'), [proposals]);

  const setOpenFiles = useAppStore((s) => s.setCodeOpenFiles);

  const markTabSaved = useCallback(
    (path: string) => {
      setOpenFiles(
        useAppStore
          .getState()
          .codeOpenFiles.map((f) => (f.path === path ? { ...f, modified: false } : f)),
      );
    },
    [setOpenFiles],
  );

  const answerOne = useCallback(
    async (p: EditProposal, accepted: boolean) => {
      if (p.remoteId) {
        const res = await respondRemote(p.remoteId, accepted);
        
        // a 'stale' proposal means the run ended and the file was NOT written.
        if (res === 'offline') {
          toast.error('Sidecar server is not connected.');
          return;
        }
        if (res === 'stale') {
          removeProposal(p.id);
          if (accepted) toast.error(t('codeView.editStale'));
          return;
        }
        if (accepted) {
          fileContentCache.set(p.path, {
            content: p.proposedContent,
            originalContent: p.proposedContent,
            hydrated: true,
          });
          markTabSaved(p.path);
        }
      } else if (accepted) {
        try {
          await applyLocalProposal(p);
          markTabSaved(p.path);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : String(e));
          return;
        }
      }
      removeProposal(p.id);
    },
    [markTabSaved, removeProposal, t],
  );

  const answerAll = useCallback(
    async (accepted: boolean) => {
      if (busy) return;
      setBusy(true);
      try {
        let ok = 0;
        for (const p of [...pending]) {
          const before = useEditProposalStore.getState().proposals.length;
          await answerOne(p, accepted);
          const after = useEditProposalStore.getState().proposals.length;
          if (after < before) ok += 1;
        }
        if (ok > 0) {
          toast.success(
            accepted
              ? t('codeView.filesSaved', { count: ok })
              : `${t('codeView.rejectAll')}: ${ok}`,
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, pending, answerOne, t],
  );

  if (pending.length === 0) return null;

  const hasAgentProposals = pending.some((p) => p.remoteId);

  return (
    <div
      style={{
        margin: '8px 12px',
        border: '1px solid var(--accent-primary)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-secondary)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        fontSize: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'rgba(167,139,250,0.10)',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: '14px' }}>🤖</span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('codeView.proposalsTitle')}
        </span>
        <span
          style={{
            background: 'var(--accent-primary)',
            color: '#fff',
            borderRadius: 'var(--radius-full)',
            padding: '0 8px',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          {pending.length}
        </span>
        {hasAgentProposals && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            {t('codeView.proposalAgentWaiting')}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={() => void answerAll(false)}
            disabled={busy}
            style={{
              fontSize: '11px',
              padding: '2px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {t('codeView.rejectAll')}
          </button>
          <button
            onClick={() => void answerAll(true)}
            disabled={busy}
            style={{
              fontSize: '11px',
              padding: '2px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent-primary)',
              color: '#fff',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {t('codeView.acceptAll')}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? '▾' : '▴'}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '0 4px',
            }}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </div>

      {/* Rows */}
      {!collapsed && (
        <div style={{ maxHeight: '180px', overflow: 'auto' }} className="custom-scrollbar">
          {pending.map((p) => {
            const isActive = p.path === activePath;
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                }}
              >
                <span
                  style={{ color: p.isNewFile ? 'var(--success)' : 'var(--text-secondary)' }}
                  title={p.isNewFile ? t('codeView.proposalNewFile') : undefined}
                >
                  {p.isNewFile ? '✚' : '✎'}
                </span>
                <button
                  onClick={() => onJumpTo(p.path)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                    fontSize: '12px',
                    padding: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '40%',
                    textAlign: 'left',
                  }}
                  title={p.path}
                >
                  {p.fileName}
                </button>
                <DiffStatBadge original={p.originalContent} proposed={p.proposedContent} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  {!isActive && (
                    <button
                      onClick={() => onJumpTo(p.path)}
                      style={{
                        fontSize: '11px',
                        padding: '1px 8px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {t('codeView.proposalReview')}
                    </button>
                  )}
                  <button
                    onClick={() => void answerOne(p, false)}
                    style={{
                      fontSize: '11px',
                      padding: '1px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-default)',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('codeView.reject')}
                  </button>
                  <button
                    onClick={() => void answerOne(p, true)}
                    style={{
                      fontSize: '11px',
                      padding: '1px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'var(--accent-primary)',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {t('codeView.accept')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
