// ==============================================================================
// GHITA CODING AGENT — Settings View
// ==============================================================================

import { useAppStore, type ThemeMode } from '../stores/appStore';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'light', label: 'Light', icon: '☀️' },
];

const LANGUAGE_OPTIONS = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
];

const LOG_LEVEL_OPTIONS = [
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <h3
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '16px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div>
        <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; icon?: string }>;
  onChange: (val: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '6px 12px',
        background: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '13px',
        minWidth: '140px',
        cursor: 'pointer',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.icon ? `${opt.icon} ` : ''}{opt.label}
        </option>
      ))}
    </select>
  );
}

export function SettingsView() {
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const logLevel = useAppStore((s) => s.logLevel);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setLogLevel = useAppStore((s) => s.setLogLevel);

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '32px',
        maxWidth: '700px',
      }}
    >
      <h2
        style={{
          fontSize: '24px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}
      >
        ⚙️ Settings
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px' }}>
        Cấu hình ứng dụng GHITA CODING AGENT
      </p>

      <Section title="🎨 Giao diện">
        <SettingRow label="Theme" description="Chọn giao diện sáng hoặc tối">
          <Select
            value={theme}
            options={THEME_OPTIONS}
            onChange={(v) => setTheme(v as ThemeMode)}
          />
        </SettingRow>
        <SettingRow label="Ngôn ngữ" description="Ngôn ngữ hiển thị">
          <Select
            value={language}
            options={LANGUAGE_OPTIONS}
            onChange={setLanguage}
          />
        </SettingRow>
      </Section>

      <Section title="📝 Logging">
        <SettingRow label="Log Level" description="Mức độ chi tiết của log">
          <Select
            value={logLevel}
            options={LOG_LEVEL_OPTIONS}
            onChange={setLogLevel}
          />
        </SettingRow>
      </Section>

      <Section title="🤖 AI Providers">
        <SettingRow
          label="API Keys"
          description="Quản lý trong tab API"
        >
          <button
            onClick={() => useAppStore.getState().setActiveTab('api')}
            style={{
              padding: '6px 16px',
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Mở API Manager
          </button>
        </SettingRow>
      </Section>

      <Section title="ℹ️ Thông tin">
        <SettingRow label="Phiên bản" description="GHITA CODING AGENT">
          <span style={{ fontSize: '14px', color: 'var(--accent-primary)', fontWeight: 600 }}>
            v0.1.0
          </span>
        </SettingRow>
        <SettingRow label="Platform" description="Nền tảng đang chạy">
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            🖥️ Windows (Tauri)
          </span>
        </SettingRow>
      </Section>
    </div>
  );
}
