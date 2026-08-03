// =============================================================================
// GHITA CODING AGENT — Sandbox Dashboard (Phase 12 Task 10)
// Hiển thị trạng thái hoạt động và CPU/RAM sử dụng của các container sandbox
// =============================================================================

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from '../i18n';
import { useActivePolling } from '../hooks/useActivePolling';
import { ResourceBar } from './ResourceBar';
import { StatusBadge } from './StatusBadge';

// =============================================================================
// Types
// =============================================================================

/** Thông tin container đang chạy */
interface SandboxContainer {
  id: string;
  name: string;
  image: string;
  status: 'created' | 'running' | 'stopped' | 'error';
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  networkRxMb: number;
  networkTxMb: number;
}

/** Tóm tắt tài nguyên sandbox */
interface SandboxSummary {
  totalContainers: number;
  runningContainers: number;
  totalCpuPercent: number;
  totalMemoryUsageMb: number;
  totalMemoryLimitMb: number;
  totalNetworkRxMb: number;
  totalNetworkTxMb: number;
  dbLogCount: number;
}

/** Log gần nhất từ sandbox */
interface SandboxLog {
  containerName: string;
  event: string;
  message: string;
  timestamp: string;
}

// =============================================================================
// Main Component
// =============================================================================

export function SandboxDashboard() {
  const [containers, setContainers] = useState<SandboxContainer[]>([]);
  const [summary, setSummary] = useState<SandboxSummary | null>(null);
  const [recentLogs, setRecentLogs] = useState<SandboxLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const fetchSandboxData = useCallback(async () => {
    try {
      // Gọi Tauri commands (sẽ được implement trong Rust backend sau)
      const [containerData, summaryData, logData] = await Promise.allSettled([
        invoke<SandboxContainer[]>('get_sandbox_containers'),
        invoke<SandboxSummary>('get_sandbox_summary'),
        invoke<SandboxLog[]>('get_sandbox_logs', { limit: 20 }),
      ]);

      if (containerData.status === 'fulfilled') {
        const val = containerData.value;
        setContainers(Array.isArray(val) ? val : []);
      }

      if (summaryData.status === 'fulfilled') {
        let val: unknown = summaryData.value;
        if (typeof val === 'string') {
          try {
            val = JSON.parse(val);
          } catch {
            val = null;
          }
        }
        if (
          val &&
          typeof val === 'object' &&
          'runningContainers' in (val as Record<string, unknown>)
        ) {
          setSummary(val as SandboxSummary);
        } else {
          setSummary(null);
        }
      }

      if (logData.status === 'fulfilled') {
        let val = logData.value;
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            val = Array.isArray(parsed) ? parsed : [];
          } catch {
            val = [];
          }
        }
        setRecentLogs(Array.isArray(val) ? val : []);
      }

      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sandbox data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 3 s only while the app is visible (dashboard tab). The view is
  // remounted when its tab becomes active, and useActivePolling fires once
  // immediately on mount — so no separate initial-fetch effect is needed and
  // hidden tabs never make background requests.
  useActivePolling(3000, fetchSandboxData, 'dashboard');

  // =========================================================================
  // Loading State
  // =========================================================================

  if (loading && containers.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: 'var(--text-muted)',
          fontSize: '14px',
        }}
      >
        <span style={{ marginRight: '8px', fontSize: '20px' }}>&#9696;</span>
        {t('sandbox.loadingStatus')}
      </div>
    );
  }

  // =========================================================================
  // Error State (Docker không chạy)
  // =========================================================================

  if (error && containers.length === 0) {
    return (
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid rgba(239,68,68,0.2)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>&#9888;</div>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>
          {t('sandbox.notReadyTitle')}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </p>
        <button
          onClick={fetchSandboxData}
          style={{
            background: 'var(--accent-primary)',
            color: '#fff',
            border: 'none',
            padding: '8px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {t('sandbox.retry')}
        </button>
      </div>
    );
  }

  // =========================================================================
  // Main Dashboard
  // =========================================================================

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '20px' }}>&#9776;</span>
          {t('sandbox.title')}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {summary && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.05)',
                padding: '4px 10px',
                borderRadius: '8px',
              }}
            >
              {summary.runningContainers}/{summary.totalContainers} containers &middot;{' '}
              {summary.dbLogCount} logs
            </span>
          )}
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: error ? 'var(--error)' : 'var(--success)',
            }}
          />
        </div>
      </div>

      {/* Resource Summary (nhiều containers) */}
      {summary && summary.runningContainers > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              background: 'rgba(59,130,246,0.08)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: '#3b82f6',
              }}
            >
              {summary.totalCpuPercent.toFixed(1)}%
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginTop: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {t('sandbox.totalCpu')}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(168,85,247,0.08)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: '#a855f7',
              }}
            >
              {summary.totalMemoryUsageMb.toFixed(0)} MB
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginTop: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {t('sandbox.totalRam')}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(34,197,94,0.08)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: '#22c55e',
              }}
            >
              {(summary.totalNetworkRxMb + summary.totalNetworkTxMb).toFixed(1)} MB
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginTop: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {t('sandbox.networkIo')}
            </div>
          </div>
        </div>
      )}

      {/* Container List */}
      {containers.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '12px',
            }}
          >
            {t('sandbox.containers', { count: containers.length })}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Array.isArray(containers) &&
              containers.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {/* Container Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {c.name.replace(/^ghita-[a-f0-9]+-/, '')}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginLeft: '8px',
                        }}
                      >
                        {c.image}
                      </span>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>

                  {/* Resource Bars */}
                  {c.status === 'running' && (
                    <>
                      <ResourceBar
                        label="CPU"
                        value={c.cpuPercent}
                        max={100}
                        unit="%"
                        color="#3b82f6"
                      />
                      <ResourceBar
                        label="RAM"
                        value={c.memoryUsageMb}
                        max={c.memoryLimitMb}
                        unit="MB"
                        color="#a855f7"
                      />
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span>&#8593; {c.networkTxMb.toFixed(2)} MB</span>
                        <span>&#8595; {c.networkRxMb.toFixed(2)} MB</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent Logs */}
      {Array.isArray(recentLogs) && recentLogs.length > 0 && (
        <div>
          <h4
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '12px',
            }}
          >
            Recent Logs
          </h4>
          <div
            style={{
              maxHeight: '200px',
              overflowY: 'auto',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: '11px',
              lineHeight: '1.6',
            }}
          >
            {recentLogs.map((log, i) => (
              <div key={i} style={{ marginBottom: '2px' }}>
                <span style={{ color: '#4b5563' }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  style={{
                    color:
                      log.event === 'error'
                        ? '#ef4444'
                        : log.event === 'start'
                          ? '#22c55e'
                          : log.event === 'stop'
                            ? '#f59e0b'
                            : '#6b7280',
                    marginLeft: '8px',
                    fontWeight: 600,
                  }}
                >
                  [{log.event.toUpperCase()}]
                </span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {log.containerName}
                </span>
                <span style={{ color: 'var(--text-primary)', marginLeft: '8px' }}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {containers.length === 0 && !loading && (
        <div
          style={{
            textAlign: 'center',
            padding: '32px',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#9744;</div>
          <p style={{ fontSize: '13px' }}>{t('sandbox.noContainers')}</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {t('sandbox.noContainersDesc')}
          </p>
        </div>
      )}
    </div>
  );
}
