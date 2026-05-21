// ==============================================================================
// GHITA CODING AGENT — Settings View
// ==============================================================================

import { useState } from 'react';
import { useAppStore, type ThemeMode } from '../stores/appStore';
import { isWindows, isLinux } from '@ghita/shared';

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

  // Phase 5: MCP & Hooks state
  const mcpServers = useAppStore((s) => s.mcpServers);
  const setMcpServers = useAppStore((s) => s.setMcpServers);
  const hooks = useAppStore((s) => s.hooks);
  const setHooks = useAppStore((s) => s.setHooks);

  // MCP form
  const [mcpName, setMcpName] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpTransport, setMcpTransport] = useState<'stdio' | 'sse'>('stdio');

  // Hook form
  const [hookEvent, setHookEvent] = useState('post_tool');
  const [hookTool, setHookTool] = useState('');
  const [hookCommand, setHookCommand] = useState('');

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

      {/* Phase 5A: MCP Servers */}
      <Section title="🔌 MCP Servers (Model Context Protocol)">
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Cấu hình MCP servers để mở rộng tool capabilities cho AI.
        </p>
        {mcpServers.map((server, i) => (
          <SettingRow
            key={i}
            label={`${server.name} (${server.transport})`}
            description={server.enabled ? 'Enabled' : 'Disabled'}
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: server.connected ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
                  color: server.connected ? '#34d399' : '#94a3b8',
                  border: `1px solid ${server.connected ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.2)'}`,
                }}
              >
                {server.connected ? '● Connected' : '○ Disconnected'}
              </span>
              <button
                onClick={() => {
                  const updated = [...mcpServers];
                  updated[i] = { ...updated[i]!, enabled: !updated[i]!.enabled };
                  setMcpServers(updated);
                }}
                style={{
                  padding: '2px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                {server.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() => setMcpServers(mcpServers.filter((_, idx) => idx !== i))}
                style={{
                  padding: '2px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'transparent',
                  color: '#f87171',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          </SettingRow>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
          <input type="text" placeholder="Name" value={mcpName} onChange={(e) => setMcpName(e.target.value)}
            style={{ flex: '0 0 100px', padding: '6px 10px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#f8fafc', fontSize: '12px', outline: 'none' }} />
          <input type="text" placeholder="Command (e.g. npx -y @mcp/server)" value={mcpCommand} onChange={(e) => setMcpCommand(e.target.value)}
            style={{ flex: 1, padding: '6px 10px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#f8fafc', fontSize: '12px', outline: 'none' }} />
          <select value={mcpTransport} onChange={(e) => setMcpTransport(e.target.value as 'stdio' | 'sse')}
            style={{ padding: '6px 10px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#f8fafc', fontSize: '12px' }}>
            <option value="stdio">stdio</option>
            <option value="sse">sse</option>
          </select>
          <button onClick={() => { if (mcpName && mcpCommand) { setMcpServers([...mcpServers, { name: mcpName, transport: mcpTransport, enabled: true, connected: false }]); setMcpName(''); setMcpCommand(''); } }}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            + Add
          </button>
        </div>
      </Section>

      {/* Phase 5B: Hooks */}
      <Section title="🪝 Hooks (Lifecycle Scripts)">
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Scripts chạy trước/sau mỗi tool call để tự động hóa workflow.
        </p>
        {hooks.map((hook, i) => (
          <SettingRow key={i} label={`${hook.event}: ${hook.tool || '*'}`} description={hook.command}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: hook.enabled ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)', color: hook.enabled ? '#34d399' : '#94a3b8', border: `1px solid ${hook.enabled ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.2)'}` }}>
                {hook.enabled ? '● Active' : '○ Disabled'}
              </span>
              <button onClick={() => { const u = [...hooks]; u[i] = { ...u[i]!, enabled: !u[i]!.enabled }; setHooks(u); }}
                style={{ padding: '2px 10px', borderRadius: '4px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}>
                {hook.enabled ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => setHooks(hooks.filter((_, idx) => idx !== i))}
                style={{ padding: '2px 10px', borderRadius: '4px', fontSize: '11px', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          </SettingRow>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
          <select value={hookEvent} onChange={(e) => setHookEvent(e.target.value)}
            style={{ flex: '0 0 100px', padding: '6px 10px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#f8fafc', fontSize: '12px' }}>
            <option value="pre_tool">pre_tool</option>
            <option value="post_tool">post_tool</option>
            <option value="pre_response">pre_response</option>
          </select>
          <input type="text" placeholder="Tool (e.g. write_file)" value={hookTool} onChange={(e) => setHookTool(e.target.value)}
            style={{ flex: '0 0 120px', padding: '6px 10px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#f8fafc', fontSize: '12px', outline: 'none' }} />
          <input type="text" placeholder="Command" value={hookCommand} onChange={(e) => setHookCommand(e.target.value)}
            style={{ flex: 1, padding: '6px 10px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#f8fafc', fontSize: '12px', outline: 'none' }} />
          <button onClick={() => { if (hookCommand) { setHooks([...hooks, { event: hookEvent, tool: hookTool, command: hookCommand, enabled: true }]); setHookTool(''); setHookCommand(''); } }}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            + Add
          </button>
        </div>
      </Section>

      <Section title="ℹ️ Thông tin">
        <SettingRow label="Phiên bản" description="GHITA CODING AGENT">
          <span style={{ fontSize: '14px', color: 'var(--accent-primary)', fontWeight: 600 }}>
            v0.1.0
          </span>
        </SettingRow>
        <SettingRow label="Platform" description="Nền tảng đang chạy">
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {isWindows() ? '🖥️ Windows (Tauri)' : isLinux() ? '🖥️ Linux (Tauri)' : '🖥️ Unknown'}
          </span>
        </SettingRow>
      </Section>
    </div>
  );
}
