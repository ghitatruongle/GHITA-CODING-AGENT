// @vitest-environment happy-dom

// View-render smoke (v1.2.0-demo1, feat-matrix P1.4): every route-level view
// must mount without throwing under mocked backends (Tauri invoke, sockets,
// fs, Monaco). This is the automated evidence for the GUI-only matrix rows.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => ({})),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
  message: vi.fn(async () => undefined),
  ask: vi.fn(async () => 0),
  confirm: vi.fn(async () => true),
}));

vi.mock('../../utils/sharedSocket', () => {
  const makeSocket = () => ({
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    connected: false,
    disconnect: vi.fn(),
    connect: vi.fn(),
  });
  return {
    getSharedSocket: async () => makeSocket(),
    getCurrentSocket: () => makeSocket(),
  };
});

vi.mock('../../lib/native-fs', () => ({
  fsWriteText: vi.fn(async () => undefined),
  fsReadText: vi.fn(async () => ''),
  fsListDirectory: vi.fn(async () => []),
}));

vi.mock('../../lib/monaco-setup', () => ({}));
vi.mock('@monaco-editor/react', () => ({
  default: () => null,
  loader: { config: vi.fn(), __getMonacoInstance: () => null },
}));

// Stub CodeView's heavy children — their behavior has dedicated tests.
// (factories must not reference outer vars — vi.mock is hoisted)
vi.mock('../../components/FileExplorer', () => ({
  FileExplorer: ({ children }: { children?: ReactNode }) => <div data-testid="file-explorer">{children}</div>,
}));
vi.mock('../../components/EditProposalTray', () => ({
  EditProposalTray: ({ children }: { children?: ReactNode }) => <div data-testid="edit-tray">{children}</div>,
}));
vi.mock('../../components/SymbolOutline', () => ({
  SymbolOutline: ({ children }: { children?: ReactNode }) => <div data-testid="symbol-outline">{children}</div>,
}));
vi.mock('../../components/DiffStatBadge', () => ({
  DiffStatBadge: ({ children }: { children?: ReactNode }) => <div data-testid="diff-badge">{children}</div>,
}));
// CodeView lazy-imports CodeEditor (Monaco) — stub the lazy target itself.
vi.mock('../../components/CodeEditor', () => ({
  CodeEditor: ({ children }: { children?: ReactNode }) => <div data-testid="code-editor">{children}</div>,
}));
vi.mock('../../hooks/useAiEditProposal', () => ({
  useAiEditProposal: () => ({
    proposals: [],
    accept: vi.fn(),
    reject: vi.fn(),
    acceptAll: vi.fn(),
    rejectAll: vi.fn(),
    propose: vi.fn(),
    remove: vi.fn(),
  }),
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

// @ghita/skills pulls @ghita/ai-engine dist → redis-cache → ioredis (not installed).
// Same mock set as SkillManager.test.tsx (proven pattern).
vi.mock('@ghita/ai-engine', () => ({}));
vi.mock('ioredis', () => ({ default: vi.fn() }));
vi.mock('socket.io-client', () => ({ default: vi.fn() }));

// QuotaView deep-imports ai-engine SOURCE (pulls ioredis via redis-cache) — stub the surface it uses.
vi.mock('../../../../../packages/ai-engine/src/index.js', () => ({
  BudgetManager: class {
    private readonly limit: number;
    constructor(opts: { limit?: number } = {}) {
      this.limit = opts.limit ?? 0;
    }
    getCurrentSpent() {
      return 0;
    }
    getLimit() {
      return this.limit;
    }
  },
}));

import { WelcomeView } from '../WelcomeView';
import { DashboardView } from '../DashboardView';
import { SettingsView } from '../SettingsView';
import { ApiView } from '../ApiView';
import { WorkflowView } from '../WorkflowView';
import { AgentsView } from '../AgentsView';
import { CodeGraphView } from '../CodeGraphView';
import { DevicesView } from '../DevicesView';
import { EcosystemView } from '../EcosystemView';
import { MonitoringView } from '../MonitoringView';
import { QuotaView } from '../QuotaView';
import { MarketplaceView } from '../MarketplaceView';
import { SkillsView } from '../SkillsView';
import { CodeView } from '../CodeView';

const VIEWS: Array<[string, () => JSX.Element]> = [
  ['WelcomeView', () => <WelcomeView />],
  ['DashboardView', () => <DashboardView />],
  ['SettingsView', () => <SettingsView />],
  ['ApiView', () => <ApiView />],
  ['WorkflowView', () => <WorkflowView />],
  ['AgentsView', () => <AgentsView />],
  ['CodeGraphView', () => <CodeGraphView />],
  ['DevicesView', () => <DevicesView />],
  ['EcosystemView', () => <EcosystemView />],
  ['MonitoringView', () => <MonitoringView />],
  ['QuotaView', () => <QuotaView />],
  ['MarketplaceView', () => <MarketplaceView />],
  ['SkillsView', () => <SkillsView />],
  ['CodeView', () => <CodeView />],
];

describe('view-render smoke (feat-matrix GUI rows)', () => {
  for (const [name, make] of VIEWS) {
    it(`${name} mounts without throwing`, async () => {
      cleanup();
      const { container } = render(make());
      await new Promise((r) => setTimeout(r, 0)); // let effects flush
      expect(container.childElementCount).toBeGreaterThan(0);
    });
  }

  // BUG-005 regression: the signature-verified updater must be reachable from Settings.
  it('SettingsView check-update button invokes check_update and shows the result', async () => {
    cleanup();
    vi.mocked(invoke).mockResolvedValueOnce('Update to 9.9.9 postponed by the user.');
    const { container } = render(<SettingsView />);
    const btn = container.querySelector('[data-testid="check-update-btn"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn as HTMLElement);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('check_update');
      expect(container.querySelector('[data-testid="update-status"]')?.textContent).toContain(
        'postponed',
      );
    });
  });
});
