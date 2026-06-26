// ==============================================================================
// GHITA CODING AGENT — Settings View (Tailwind Edition)
// ==============================================================================

import { useState } from 'react';
import { useAppStore, type ThemeMode } from '../stores/appStore';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '../i18n';
import { isWindows, isLinux } from '@ghita/shared';
import { Button, Badge, Input } from '../components/ui';

const LANGUAGE_OPTIONS = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '简体中文' },
  { value: 'ru', label: 'Русский' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-subtle)]">
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
    <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
      <div>
        <div className="text-sm text-[var(--text-primary)] font-medium">{label}</div>
        {description && (
          <div className="text-xs text-[var(--text-muted)] mt-0.5">{description}</div>
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
      className="px-3 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-default)] rounded text-[13px] min-w-[140px] cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.icon ? `${opt.icon} ` : ''}
          {opt.label}
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
  const { t } = useTranslation();

  const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: string }> = [
    { value: 'dark', label: t('settings.themeDark'), icon: '🌙' },
    { value: 'light', label: t('settings.themeLight'), icon: '☀️' },
  ];

  const LOG_LEVEL_OPTIONS = [
    { value: 'debug', label: t('settings.logDebug') },
    { value: 'info', label: t('settings.logInfo') },
    { value: 'warn', label: t('settings.logWarn') },
    { value: 'error', label: t('settings.logError') },
  ];

  // Phase 5: MCP & Hooks state
  const mcpServers = useAppStore(useShallow((s) => s.mcpServers));
  const setMcpServers = useAppStore((s) => s.setMcpServers);
  const hooks = useAppStore(useShallow((s) => s.hooks));
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
    <div className="h-full overflow-auto p-8 max-w-[700px]">
      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
        ⚙️ {t('settings.title')}
      </h2>
      <p className="text-[var(--text-muted)] text-sm mb-8">{t('settings.subtitle')}</p>

      <Section title={`🎨 ${t('settings.appearance')}`}>
        <SettingRow label={t('settings.theme')} description={t('settings.themeDesc')}>
          <Select
            value={theme}
            options={THEME_OPTIONS}
            onChange={(v) => setTheme(v as ThemeMode)}
          />
        </SettingRow>
        <SettingRow label={t('settings.language')} description={t('settings.languageDesc')}>
          <Select value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
        </SettingRow>
      </Section>

      <Section title={`📝 ${t('settings.logging')}`}>
        <SettingRow label={t('settings.logLevel')} description={t('settings.logLevelDesc')}>
          <Select value={logLevel} options={LOG_LEVEL_OPTIONS} onChange={setLogLevel} />
        </SettingRow>
      </Section>

      <Section title={`🤖 ${t('settings.aiProviders')}`}>
        <SettingRow label={t('settings.apiKeys')} description={t('settings.apiKeysDesc')}>
          <Button
            variant="primary"
            size="md"
            onClick={() => useAppStore.getState().setActiveTab('api')}
          >
            {t('settings.openApiManager')}
          </Button>
        </SettingRow>
      </Section>

      {/* Phase 5A: MCP Servers */}
      <Section title={`🔌 ${t('settings.mcpServers')}`}>
        <p className="text-[13px] text-[var(--text-muted)] mb-3">{t('settings.mcpServersDesc')}</p>
        {mcpServers.map((server) => {
          // BUG FIX: Use stable composite key (name + transport) instead of
          // array index for both React reconciliation and the filter predicate.
          const serverKey = server.id || `${server.name}::${server.transport}`;
          return (
            <SettingRow
              key={serverKey}
              label={`${server.name} (${server.transport})`}
              description={server.enabled ? t('common.enabled') : t('common.disabled')}
            >
              <div className="flex gap-2">
                <Badge variant={server.connected ? 'success' : 'neutral'} dot>
                  {server.connected ? t('common.connected') : t('common.disconnected')}
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setMcpServers(
                      mcpServers.map((s) =>
                        (
                          server.id
                            ? s.id === server.id
                            : s.name === server.name && s.transport === server.transport
                        )
                          ? { ...s, enabled: !s.enabled }
                          : s,
                      ),
                    );
                  }}
                >
                  {server.enabled ? t('common.disable') : t('common.enable')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    setMcpServers(
                      mcpServers.filter((s) =>
                        server.id
                          ? s.id !== server.id
                          : !(s.name === server.name && s.transport === server.transport),
                      ),
                    )
                  }
                >
                  {t('common.remove')}
                </Button>
              </div>
            </SettingRow>
          );
        })}
        <div className="flex gap-2 mt-3 items-center">
          <Input
            placeholder={t('settings.mcpNamePlaceholder')}
            value={mcpName}
            onChange={(e) => setMcpName(e.target.value)}
            className="flex-none w-[100px]"
          />
          <Input
            placeholder={t('settings.mcpCommandPlaceholder')}
            value={mcpCommand}
            onChange={(e) => setMcpCommand(e.target.value)}
            className="flex-1"
          />
          <select
            value={mcpTransport}
            onChange={(e) => setMcpTransport(e.target.value as 'stdio' | 'sse')}
            className="px-2.5 py-1.5 text-xs rounded-md bg-slate-900/60 border border-white/10 text-slate-100"
          >
            <option value="stdio">stdio</option>
            <option value="sse">sse</option>
          </select>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              if (mcpName && mcpCommand) {
                setMcpServers([
                  ...mcpServers,
                  {
                    id: crypto.randomUUID(),
                    name: mcpName,
                    transport: mcpTransport,
                    enabled: true,
                    connected: false,
                  },
                ]);
                setMcpName('');
                setMcpCommand('');
              }
            }}
          >
            + {t('common.add')}
          </Button>
        </div>
      </Section>

      {/* Phase 5B: Hooks */}
      <Section title={`🪝 ${t('settings.hooks')}`}>
        <p className="text-[13px] text-[var(--text-muted)] mb-3">{t('settings.hooksDesc')}</p>
        {hooks.map((hook, i) => (
          <SettingRow
            key={i}
            label={`${hook.event}: ${hook.tool || '*'}`}
            description={hook.command}
          >
            <div className="flex gap-2">
              <Badge variant={hook.enabled ? 'success' : 'neutral'} dot>
                {hook.enabled ? t('common.active') : t('common.disabled')}
              </Badge>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const u = [...hooks];
                  const h = u[i];
                  if (h) {
                    u[i] = { ...h, enabled: !h.enabled };
                  }
                  setHooks(u);
                }}
              >
                {hook.enabled ? t('common.disable') : t('common.enable')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setHooks(hooks.filter((_, idx) => idx !== i))}
              >
                {t('common.remove')}
              </Button>
            </div>
          </SettingRow>
        ))}
        <div className="flex gap-2 mt-3 items-center">
          <select
            value={hookEvent}
            onChange={(e) => setHookEvent(e.target.value)}
            className="flex-none w-[100px] px-2.5 py-1.5 text-xs rounded-md bg-slate-900/60 border border-white/10 text-slate-100"
          >
            <option value="pre_tool">pre_tool</option>
            <option value="post_tool">post_tool</option>
            <option value="pre_response">pre_response</option>
          </select>
          <Input
            placeholder={t('settings.hookToolPlaceholder')}
            value={hookTool}
            onChange={(e) => setHookTool(e.target.value)}
            className="flex-none w-[120px]"
          />
          <Input
            placeholder={t('settings.hookCommandPlaceholder')}
            value={hookCommand}
            onChange={(e) => setHookCommand(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              if (hookCommand) {
                setHooks([
                  ...hooks,
                  { event: hookEvent, tool: hookTool, command: hookCommand, enabled: true },
                ]);
                setHookTool('');
                setHookCommand('');
              }
            }}
          >
            + {t('common.add')}
          </Button>
        </div>
      </Section>

      <Section title={`ℹ️ ${t('settings.info')}`}>
        <SettingRow label={t('settings.version')} description="GHITA CODING AGENT">
          <span className="text-sm text-[var(--accent-primary)] font-semibold">
            {t('app.version')}
          </span>
        </SettingRow>
        <SettingRow label={t('settings.platform')} description={t('settings.platformDesc')}>
          <span className="text-sm text-[var(--text-secondary)]">
            {isWindows()
              ? `🖥️ ${t('settings.windows')}`
              : isLinux()
                ? `🖥️ ${t('settings.linux')}`
                : `🖥️ ${t('mainLayout.unknown')}`}
          </span>
        </SettingRow>
      </Section>
    </div>
  );
}
