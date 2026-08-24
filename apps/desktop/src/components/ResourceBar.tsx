export function ResourceBar({
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
  const barColor = percent > 80 ? 'var(--error)' : percent > 60 ? 'var(--warning)' : color;

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
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
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
