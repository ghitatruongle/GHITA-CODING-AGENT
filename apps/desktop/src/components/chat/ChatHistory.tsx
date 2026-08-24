// Session list with select, create, and delete functionality.

import React from 'react';
import type { ChatSession } from '../../hooks/useChatSessions';
import type { AgentRunSummary } from './useChatSocket';

interface ChatHistoryProps {
  sessions: ChatSession[];
  activeSessionId: string;
  lang: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  handleSelectSession: (id: string) => void;
  handleCreateSession: () => void;
  handleDeleteSession: (id: string, e: React.MouseEvent) => void;
  agentRuns: AgentRunSummary[];
  onRefreshAgentRuns: () => void;
  onResumeAgentRun: (runId: string) => void;
}

export function ChatHistory({
  sessions,
  activeSessionId,
  lang,
  t,
  handleSelectSession,
  handleCreateSession,
  handleDeleteSession,
  agentRuns,
  onRefreshAgentRuns,
  onResumeAgentRun,
}: ChatHistoryProps) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
      className="custom-scrollbar"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#a5b4fc',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {t('chat.chatHistory')}
        </span>
        <button
          type="button"
          onClick={handleCreateSession}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            background:
              'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(79, 70, 229, 0.2) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '6px',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s',
          }}
        >
          ➕ {t('chat.newChat')}
        </button>
      </div>

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '40px 0' }}>
          {t('chat.noHistory')}
        </div>
      ) : (
        sessions.map((sess) => (
          <div
            key={sess.id}
            role="button"
            tabIndex={0}
            aria-current={sess.id === activeSessionId ? 'true' : undefined}
            onClick={() => handleSelectSession(sess.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleSelectSession(sess.id);
              }
            }}
            style={{
              padding: '12px 14px',
              background:
                sess.id === activeSessionId ? 'rgba(99, 102, 241, 0.12)' : 'rgba(30, 41, 59, 0.4)',
              border:
                sess.id === activeSessionId
                  ? '1px solid rgba(99, 102, 241, 0.35)'
                  : '1px solid rgba(255, 255, 255, 0.04)',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              transition: 'all 0.2s',
              boxShadow:
                sess.id === activeSessionId ? '0 4px 20px rgba(99, 102, 241, 0.08)' : 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minWidth: 0,
                flex: 1,
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: sess.id === activeSessionId ? '#fff' : '#cbd5e1',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {sess.title}
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.5)' }}>
                {new Date(sess.timestamp).toLocaleString(
                  lang === 'vi' ? 'vi-VN' : lang === 'zh' ? 'zh-CN' : 'en-US',
                  { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
                )}
                <span style={{ margin: '0 6px' }}>•</span>
                {t('chat.messagesCount', {
                  count: sess.messages.filter((m) => m.id !== 'streaming-message').length,
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => handleDeleteSession(sess.id, e)}
              title={t('chat.deleteChat')}
              aria-label={t('chat.deleteChat')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '12px',
                cursor: 'pointer',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              🗑️
            </button>
          </div>
        ))
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '18px',
          paddingTop: '18px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#fbbf24',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          Nhật ký agent bền vững
        </span>
        <button
          type="button"
          onClick={onRefreshAgentRuns}
          aria-label="Làm mới nhật ký agent"
          style={{
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '6px',
            background: 'rgba(245,158,11,0.08)',
            color: '#fcd34d',
            padding: '4px 9px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          Làm mới
        </button>
      </div>

      {agentRuns.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '12px', padding: '12px 0' }}>
          Chưa có tác vụ agent nào được lưu.
        </div>
      ) : (
        agentRuns.map((run) => {
          const canResume =
            run.status === 'failed' || run.status === 'interrupted' || run.status === 'exhausted';
          const statusColor =
            run.status === 'completed'
              ? '#4ade80'
              : run.status === 'running'
                ? '#60a5fa'
                : run.status === 'interrupted' || run.status === 'exhausted'
                  ? '#fbbf24'
                  : '#fb7185';
          return (
            <article
              key={run.runId}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(30,41,59,0.45)',
                border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span
                  title={run.task}
                  style={{
                    color: '#e2e8f0',
                    fontSize: '12px',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {run.task || run.runId}
                </span>
                <span
                  style={{
                    color: statusColor,
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {run.status}
                </span>
              </div>
              <div style={{ color: '#64748b', fontSize: '10px' }}>
                {new Date(run.updatedAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}
                {' · '}
                {run.stepsCount} bước
                {run.pendingActionsCount > 0 ? ` · ${run.pendingActionsCount} tool đang chờ` : ''}
              </div>
              {(run.error || run.outputPreview) && (
                <div
                  style={{
                    color: run.error ? '#fda4af' : '#94a3b8',
                    fontSize: '11px',
                    lineHeight: 1.45,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {run.error || run.outputPreview}
                </div>
              )}
              {canResume && (
                <button
                  type="button"
                  onClick={() => onResumeAgentRun(run.runId)}
                  style={{
                    alignSelf: 'flex-start',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: '7px',
                    background: 'rgba(245,158,11,0.12)',
                    color: '#fde68a',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  Tiếp tục từ checkpoint
                </button>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
