// Docker Sandbox Dashboard — planned v2.0 feature.
//
// The Rust backend does not expose real container telemetry yet (the
// get_sandbox_* commands return placeholders), so this view states its
// roadmap status explicitly instead of rendering a permanently empty
// dashboard that polls every 3 seconds.

export function SandboxDashboard() {
  const styles = {
    card: {
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '32px',
      border: '1px solid rgba(255,255,255,0.05)',
      textAlign: 'center' as const,
    },
    icon: { fontSize: '40px', marginBottom: '12px' },
    title: {
      fontSize: '16px',
      fontWeight: 700,
      color: 'var(--text-primary)',
      marginBottom: '8px',
    },
    body: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' },
    badge: {
      display: 'inline-block',
      fontSize: '12px',
      fontWeight: 700,
      color: '#a855f7',
      background: 'rgba(168,85,247,0.12)',
      border: '1px solid rgba(168,85,247,0.3)',
      padding: '6px 14px',
      borderRadius: '999px',
      marginBottom: '16px',
    },
    footnote: { fontSize: '11px', color: 'var(--text-muted)' },
  };

  return (
    <div style={styles.card}>
      <div style={styles.icon}>&#128051;</div>
      <h3 style={styles.title}>Docker Sandbox Dashboard</h3>
      <p style={styles.body}>
        Live container status, CPU/RAM/network usage and sandbox event logs will
        appear here once the Docker-based sandbox ships.
      </p>
      <div style={styles.badge}>Planned for v2.0</div>
      <p style={styles.footnote}>
        The built-in execution sandbox (Landlock / Seatbelt / Windows Job Object)
        is already active today — this dashboard covers the optional
        Docker-based sandbox only.
      </p>
    </div>
  );
}
