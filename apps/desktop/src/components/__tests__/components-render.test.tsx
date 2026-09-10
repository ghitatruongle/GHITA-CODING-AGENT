// @vitest-environment happy-dom

// Component-render smoke (v1.2.0-demo1, feat-matrix GUI rows): interactive
// components not covered by dedicated tests must mount under mocked backends.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({})) }));
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
  return { getSharedSocket: async () => makeSocket(), getCurrentSocket: () => makeSocket() };
});
vi.mock('@ghita/ai-engine', () => ({}));
vi.mock('ioredis', () => ({ default: vi.fn() }));
vi.mock('socket.io-client', () => ({ default: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));
vi.mock('../../lib/native-fs', () => ({
  fsWriteText: vi.fn(async () => undefined),
  fsReadText: vi.fn(async () => ''),
  fsListDirectory: vi.fn(async () => []),
  fsReadDir: vi.fn(async () => []),
}));

import { ActivityBar } from '../ActivityBar';
import { AgentGroups } from '../AgentGroups';
import { ApiManager } from '../ApiManager';
import { ConnectionGuide } from '../ConnectionGuide';
import { DiffStatBadge } from '../DiffStatBadge';
import { EditProposalTray } from '../EditProposalTray';
import { FileExplorer } from '../FileExplorer';
import { QuickAccessLinks } from '../QuickAccessLinks';
import { QuickFileOpen } from '../QuickFileOpen';
import { ResourceBar } from '../ResourceBar';
import { ShortcutsOverlay } from '../ShortcutsOverlay';
import { StatusBadge } from '../StatusBadge';
import { TabBar } from '../TabBar';
import { Toast } from '../Toast';
import { WebViewPanel } from '../WebViewPanel';
import { ChatHeader } from '../chat/ChatHeader';

describe('component-render smoke (feat-matrix GUI rows)', () => {
  beforeEach(() => cleanup());

  const noProps: Array<[string, () => JSX.Element]> = [
    ['ActivityBar', () => <ActivityBar />],
    ['AgentGroups', () => <AgentGroups />],
    ['ApiManager', () => <ApiManager />],
    ['ConnectionGuide', () => <ConnectionGuide />],
    ['TabBar', () => <TabBar />],
    ['Toast', () => <Toast />],
    ['WebViewPanel', () => <WebViewPanel />],
    ['StatusBadge', () => <StatusBadge status="ok" />],
    ['DiffStatBadge', () => <DiffStatBadge original={'a\nb'} proposed={'a\nc'} />],
    [
      'ResourceBar',
      () => <ResourceBar label="RAM" value={10} max={100} unit="MB" color="#4488ff" />,
    ],
    ['QuickFileOpen', () => <QuickFileOpen open onClose={() => {}} />],
    ['ShortcutsOverlay', () => <ShortcutsOverlay open onClose={() => {}} />],
    [
      'FileExplorer',
      () => <FileExplorer rootPath="." onFileOpen={() => {}} />,
    ],
    [
      'EditProposalTray',
      () => <EditProposalTray activePath="a.ts" onJumpTo={() => {}} />,
    ],
    [
      'QuickAccessLinks',
      () => (
        <QuickAccessLinks
          onNavigate={() => {}}
          border="#333"
          textPrimary="#eee"
        />
      ),
    ],
  ];

  for (const [name, make] of noProps) {
    it(`${name} mounts without throwing`, async () => {
      const { container } = render(make());
      await new Promise((r) => setTimeout(r, 0));
      expect(container).toBeTruthy();
    });
  }

  it('ChatHeader mounts and exports chat to Markdown on click', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const props = {
      t: (k: string) => k,
      connectionStatus: 'connected',
      currentView: 'chat',
      setCurrentView: () => {},
      handleCreateSession: () => {},
      handleReconnect: () => {},
      messages: [
        { id: '1', role: 'user', content: 'hello', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'hi there', timestamp: 2 },
      ],
      modelOptions: [],
      provider: 'openai',
      setProvider: () => {},
      modelDropdownOpen: false,
      setModelDropdownOpen: () => {},
      modelSearch: '',
      setModelSearch: () => {},
    } as unknown as ComponentProps<typeof ChatHeader>;

    const { container } = render(<ChatHeader {...props} />);
    // t-mock returns the key verbatim → export button has title="chat.exportChat"
    const btn = container.querySelector('button[title="chat.exportChat"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn as HTMLElement);
    expect(createObjectURL).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });
});
