// ==============================================================================
// GHITA CODING AGENT — Chat Tool & File Approval Modals
// Human-in-the-loop approval dialogs with glassmorphism styling.
// ==============================================================================

import React from 'react';
import type { ToolApprovalRequest, FileApprovalRequest } from './useChatSocket';

interface ChatToolApprovalProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  approvalRequest: ToolApprovalRequest | null;
  fileApprovalRequest: FileApprovalRequest | null;
  onApproveTool: () => void;
  onRejectTool: () => void;
  onApproveFileWrite: () => void;
  onRejectFileWrite: () => void;
}

export function ChatToolApproval({
  t,
  approvalRequest,
  fileApprovalRequest,
  onApproveTool,
  onRejectTool,
  onApproveFileWrite,
  onRejectFileWrite,
}: ChatToolApprovalProps) {
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 9999,
    animation: 'fadeIn 0.2s ease',
  };

  return (
    <>
      {/* Tool Approval Modal */}
      {approvalRequest && (
        <div style={overlayStyle}>
          <div
            style={{
              width: '100%',
              maxWidth: '300px',
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              boxShadow: '0 8px 32px rgba(244, 63, 94, 0.2)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <span
                style={{ fontWeight: 700, fontSize: '13px', color: '#f43f5e', letterSpacing: '1px' }}
              >
                {t('chat.approveTool')}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
                {t('chat.toolName')}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#f1f5f9',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {approvalRequest.name}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
                {t('chat.parameters')}
              </span>
              <pre
                style={{
                  margin: 0,
                  padding: '10px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#cbd5e1',
                  maxHeight: '120px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {approvalRequest.arguments}
              </pre>
            </div>

            {approvalRequest.warningMessage && (
              <div
                style={{
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '11px',
                  color: '#fda4af',
                  lineHeight: '1.5',
                }}
              >
                🚨 **{t('chat.warning')}** {approvalRequest.warningMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={onRejectTool}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  background: 'rgba(15, 23, 42, 0.4)',
                  color: '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {t('chat.reject')}
              </button>
              <button
                onClick={onApproveTool}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)',
                  transition: 'transform 0.1s',
                }}
              >
                {t('chat.approve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Write Approval Modal */}
      {fileApprovalRequest && (
        <div style={overlayStyle}>
          <div
            style={{
              width: '100%',
              maxWidth: '300px',
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              boxShadow: '0 8px 32px rgba(59, 130, 246, 0.2)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>
                {fileApprovalRequest.operation === 'write' ? '📝' : '✏️'}
              </span>
              <span
                style={{ fontWeight: 700, fontSize: '13px', color: '#3b82f6', letterSpacing: '1px' }}
              >
                {fileApprovalRequest.operation === 'write' ? 'TẠO FILE MỚI' : 'SỬA FILE'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
                File
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#f1f5f9',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {fileApprovalRequest.filePath}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={onRejectFileWrite}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  background: 'rgba(15, 23, 42, 0.4)',
                  color: '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {t('chat.reject')}
              </button>
              <button
                onClick={onApproveFileWrite}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                  transition: 'transform 0.1s',
                }}
              >
                {t('chat.approve')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
