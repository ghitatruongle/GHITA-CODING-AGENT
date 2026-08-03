// ==============================================================================
// Monitoring Dashboard — uses browser-safe monitoring primitives only
// (ErrorMonitor is a Tauri-Rust concern; we use UsageTelemetry + AlertEngine here.)
// ==============================================================================

import { useState, useCallback } from 'react';
import { UsageTelemetry, AlertEngine } from '../../../../packages/monitoring/src/index.js';
import type { TelemetryEvent, Severity } from '../../../../packages/monitoring/src/index.js';
import { useTranslation } from '../i18n';
import { useActivePolling } from '../hooks/useActivePolling';

let _usage: UsageTelemetry | null = null;
let _alerts: AlertEngine | null = null;

function getUsage(): UsageTelemetry {
  if (!_usage) _usage = new UsageTelemetry({ enabled: true });
  return _usage;
}

function getAlerts(): AlertEngine {
  if (!_alerts) _alerts = new AlertEngine();
  return _alerts;
}

interface Snapshot {
  // Error groups derived from real local telemetry events (UsageTelemetry).
  // Empty until actual errors are recorded — no fabricated sample data.
  errorGroups: Array<{
    fingerprint: string;
    type: string;
    message: string;
    count: number;
    lastSeen: number;
  }>;
  totalErrors: number;
  alertRules: number;
  telemetry: TelemetryEvent[];
}

export function MonitoringView() {
  const { t } = useTranslation();
  const [snap, setSnap] = useState<Snapshot>({
    errorGroups: [],
    totalErrors: 0,
    alertRules: 0,
    telemetry: [],
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const usage = getUsage();
    const alerts = getAlerts();

    // Group real error events from local telemetry into a "recently observed"
    // view. Nothing is fabricated — an empty page just means no errors yet.
    const events = usage.getEvents();
    const errorEvents = events.filter((e) => e.category === 'system' && /error|fail/i.test(e.name));
    const seen = new Map<
      string,
      { count: number; lastSeen: number; message: string; type: string }
    >();
    for (const e of errorEvents) {
      const key = e.name;
      const prev = seen.get(key);
      if (prev) {
        prev.count += 1;
        prev.lastSeen = Math.max(prev.lastSeen, e.timestamp);
      } else {
        seen.set(key, {
          count: 1,
          lastSeen: e.timestamp,
          message: (e.meta?.error as string) ?? e.name,
          type: 'system',
        });
      }
    }
    const errorGroups = Array.from(seen.entries()).map(([fingerprint, v]) => ({
      fingerprint,
      type: v.type,
      message: v.message,
      count: v.count,
      lastSeen: v.lastSeen,
    }));

    setSnap({
      errorGroups,
      totalErrors: errorEvents.length,
      alertRules: alerts.listRules().length,
      telemetry: events,
    });
    setLoading(false);
  }, []);

  // Poll only while the window is visible — no background polling while hidden.
  // useActivePolling fires once immediately on mount, so no separate initial
  // refresh effect is needed.
  useActivePolling(15_000, refresh, 'monitoring');

  const severityColor = (s: Severity | string): string => {
    switch (s) {
      case 'critical':
      case 'fatal':
        return '#ef4444';
      case 'high':
      case 'error':
        return '#f59e0b';
      case 'medium':
      case 'warning':
        return '#eab308';
      case 'low':
      case 'info':
        return '#3b82f6';
      default:
        return '#9ca3af';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
        {t('monitoring.loading')}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', margin: '0 0 24px' }}>{t('monitoring.title')}</h1>

      {/* Stats grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <StatCard
          title={t('monitoring.totalErrors')}
          value={snap.totalErrors}
          color="#ef4444"
          icon="⚠️"
        />
        <StatCard
          title={t('monitoring.errorGroups')}
          value={snap.errorGroups.length}
          color="#f59e0b"
          icon="📁"
        />
        <StatCard
          title={t('monitoring.alertRules')}
          value={snap.alertRules}
          color="#3b82f6"
          icon="🔔"
        />
        <StatCard
          title={t('monitoring.telemetryEvents')}
          value={snap.telemetry.length}
          color="#10b981"
          icon="📊"
        />
      </div>

      {/* Error groups */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', margin: '0 0 12px', color: 'var(--text-secondary)' }}>
          {t('monitoring.recentErrors')}
        </h2>
        {snap.errorGroups.length === 0 ? (
          <Empty msg={t('monitoring.noErrors')} />
        ) : (
          <div>
            {snap.errorGroups.slice(0, 10).map((g) => (
              <div
                key={g.fingerprint}
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <strong style={{ fontSize: '13px' }}>{g.type || g.fingerprint}</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{g.count}×</span>
                </div>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    margin: '4px 0',
                  }}
                >
                  {g.message || '—'}
                </p>
                <small style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {t('monitoring.lastSeen')}: {new Date(g.lastSeen).toLocaleString()}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Telemetry */}
      <section>
        <h2 style={{ fontSize: '16px', margin: '0 0 12px', color: 'var(--text-secondary)' }}>
          {t('monitoring.recentTelemetry')}
        </h2>
        {snap.telemetry.length === 0 ? (
          <Empty msg={t('monitoring.noTelemetry')} />
        ) : (
          <div
            style={{
              maxHeight: '300px',
              overflowY: 'auto',
              fontSize: '11px',
              fontFamily: 'monospace',
            }}
          >
            {snap.telemetry.slice(-50).map((t: TelemetryEvent, i: number) => (
              <div
                key={i}
                style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                [{new Date(t.timestamp).toISOString()}] {t.category} · {t.name}
                {t.durationMs !== undefined ? ` · ${t.durationMs}ms` : ''}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Severity legend (uses severityColor for consistency) */}
      <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {(['critical', 'error', 'warning', 'info'] as Severity[]).map((s) => (
          <span
            key={s}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: severityColor(s),
              color: 'white',
            }}
          >
            {t(`monitoring.severity${s.charAt(0).toUpperCase() + s.slice(1)}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  color,
}: {
  icon: string;
  title: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        background: 'var(--bg-secondary)',
        border: '1px dashed var(--border-subtle)',
        borderRadius: '6px',
      }}
    >
      {msg}
    </div>
  );
}
