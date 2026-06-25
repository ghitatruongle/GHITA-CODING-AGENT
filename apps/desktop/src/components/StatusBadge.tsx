/** Badge trạng thái container */
export function StatusBadge({ status }: { status: string }) {
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
