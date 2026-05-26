// =============================================================================
// GHITA CODING AGENT — Sandbox Dashboard (Phase 12 Task 10)
// Hiển thị trạng thái hoạt động và CPU/RAM sử dụng của các container sandbox
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from '../i18n';

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
// Sub-components
// =============================================================================

/** Thanh tiến trình tài nguyên (CPU/RAM) */
function ResourceBar({
  label,
  value,
  max,
  unit,
  color,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barColor =
    percent > 80 ? 'var(--error)' : percent > 60 ? 'var(--warning)' : color;

  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          marginBottom: '6px',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
          {label}
        </span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
          {value.toFixed(1)} {unit}
          {max > 0 && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
              {' '}
              / {max.toFixed(0)} {unit}
            </span>
          )}
        </span>
      </div>
      <div
        style={{
          height: '8px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: barColor,
            borderRadius: '4px',
            transition: 'width 0.5s ease',
          }}
        />
      </div>
    </div>
  );
}

/** Badge trạng thái container */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    running: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
    created: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
    stopped: { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
    error: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  };
  const style = colors[status] || { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' };

  return (
    <span
      style={{
        background: style.bg,
        color: style.text,
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {status}
    </span>
  );
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

      if (containerData.status === 'fulfilled') setContainers(containerData.value);
      if (summaryData.status === 'fulfilled') setSummary(summaryData.value);
      if (logData.status === 'fulfilled') setRecentLogs(logData.value);

      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch sandbox data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSandboxData();
    // Poll mỗi 3 giây
    const interval = setInterval(fetchSandboxData, 3000);
    return () => clearInterval(interval);
  }, [fetchSandboxData]);

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
              {summary.runningContainers}/{summary.totalContainers} containers
              &middot; {summary.dbLogCount} logs
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
            {containers.map((c) => (
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
                      <span>
                        &#8593; {c.networkTxMb.toFixed(2)} MB
                      </span>
                      <span>
                        &#8595; {c.networkRxMb.toFixed(2)} MB
                      </span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Logs */}
      {recentLogs.length > 0 && (
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
