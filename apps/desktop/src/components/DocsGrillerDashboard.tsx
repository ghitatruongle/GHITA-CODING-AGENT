// =============================================================================
// GHITA CODING AGENT — DocsGriller Dashboard Component (Phase 5 Task 6)
// Hiển thị kết quả /grill-me: contradictions, Socratic questions, design decisions
// =============================================================================

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from '../i18n';

// =============================================================================
// Types
// =============================================================================

interface GrillContradiction {
  topic: string;
  docA: { file: string; excerpt: string };
  docB: { file: string; excerpt: string };
  severity: 'minor' | 'major' | 'critical';
  recommendation: string;
}

interface GrillQuestion {
  question: string;
  sourceDocs: string[];
  severity: 'info' | 'warning' | 'contradiction';
}

interface GrillSession {
  id: string;
  timestamp: string;
  docsPath: string;
  docsScanned: number;
  questions: GrillQuestion[];
  contradictions: GrillContradiction[];
  userAnswers: Record<string, string>;
  designDecisions: string[];
}

// =============================================================================
// Sub-components
// =============================================================================

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    critical: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.3)' },
    major: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
    minor: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
    contradiction: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.3)' },
    warning: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
    info: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  };
  const c = colors[severity] || { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
      fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {severity}
    </span>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function DocsGrillerDashboard() {
  const [session, setSession] = useState<GrillSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docsPath, setDocsPath] = useState('docs/');
  const { t } = useTranslation();

  const runGrillSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<GrillSession>('run_grill_session', { docsPath });
      setSession(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to run grill session');
    } finally {
      setLoading(false);
    }
  }, [docsPath]);

  return (
    <div style={{
      background: 'var(--bg-card, #0c0c16)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #f8fafc)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {t('docsGriller.title')}
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={docsPath}
            onChange={(e) => setDocsPath(e.target.value)}
            placeholder="docs/"
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '6px 12px', color: '#f8fafc', fontSize: '13px', width: '140px',
            }}
          />
          <button
            onClick={runGrillSession}
            disabled={loading}
            style={{
              background: loading ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: '8px', padding: '6px 16px',
              color: '#fff', fontWeight: 600, fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? t('docsGriller.scanning') : t('docsGriller.scanDocs')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#f87171', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!session && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted, #94a3b8)', fontSize: '14px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}> </div>
          <p>{t('docsGriller.scanPrompt')}</p>
          <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>{t('docsGriller.supportedFormats')}</p>
        </div>
      )}

      {/* Session Results */}
      {session && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(99,102,241,0.1)', borderRadius: '8px', padding: '10px 16px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{t('docsGriller.docsScanned')}</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#a78bfa' }}>{session.docsScanned}</div>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: '8px', padding: '10px 16px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{t('docsGriller.contradictions')}</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#f87171' }}>{session.contradictions.length}</div>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: '8px', padding: '10px 16px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{t('docsGriller.questions')}</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#fbbf24' }}>{session.questions.length}</div>
            </div>
          </div>

          {/* Contradictions */}
          {session.contradictions.length > 0 && (
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#f87171', marginBottom: '10px' }}>
                {t('docsGriller.contradictionsFound', { count: session.contradictions.length })}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {session.contradictions.map((c, i) => (
                  <div key={i} style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <SeverityBadge severity={c.severity} />
                      <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>{c.topic}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                      <strong>{t('docsGriller.older')}</strong> <code style={{ color: '#60a5fa' }}>{c.docA.file}</code>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                      <strong>{t('docsGriller.newer')}</strong> <code style={{ color: '#34d399' }}>{c.docB.file}</code>
                    </div>
                    <div style={{ fontSize: '12px', color: '#fbbf24', fontStyle: 'italic' }}>
                      {c.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Questions */}
          {session.questions.length > 0 && (
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#fbbf24', marginBottom: '10px' }}>
                {t('docsGriller.socraticQuestions', { count: session.questions.length })}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {session.questions.map((q, i) => (
                  <div key={i} style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <SeverityBadge severity={q.severity} />
                      <span style={{ fontSize: '13px', color: '#f8fafc', fontWeight: 500 }}>{q.question}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {t('docsGriller.sources')} {q.sourceDocs.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Design Decisions */}
          {session.designDecisions.length > 0 && (
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#34d399', marginBottom: '10px' }}>
                {t('docsGriller.designDecisions')}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {session.designDecisions.map((d, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#94a3b8', padding: '4px 0' }}>
                    {d}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No issues found */}
          {session.contradictions.length === 0 && session.questions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#34d399', fontSize: '14px' }}>
              {t('docsGriller.allConsistent')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
