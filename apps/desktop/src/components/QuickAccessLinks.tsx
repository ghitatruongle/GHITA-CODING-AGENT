interface QuickAccessSite {
  label: string;
  url: string;
  icon: string;
}

export function QuickAccessLinks({
  onNavigate,
  border,
  textPrimary,
}: {
  onNavigate: (url: string) => void;
  border: string;
  textPrimary: string;
}) {
  const sites: QuickAccessSite[] = [
    { label: 'Google', url: 'https://google.com', icon: '🔍' },
    { label: 'GitHub', url: 'https://github.com', icon: '🐙' },
    { label: 'MDN Docs', url: 'https://developer.mozilla.org', icon: '📚' },
    { label: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '💡' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginTop: 8,
      }}
    >
      {sites.map((site) => (
        <button
          key={site.url}
          onClick={() => onNavigate(site.url)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '14px 18px',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${border}`,
            borderRadius: 12,
            color: textPrimary,
            cursor: 'pointer',
            fontSize: 12,
            transition: 'all 0.15s',
            minWidth: 90,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(59,130,246,0.1)';
            e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            e.currentTarget.style.borderColor = border;
          }}
        >
          <span style={{ fontSize: 24 }}>{site.icon}</span>
          {site.label}
        </button>
      ))}
    </div>
  );
}
