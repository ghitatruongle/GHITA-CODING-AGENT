// Verifies the remaining mobile screen modules load and export their
// components (v1.2.0-demo1 feat-matrix rows B1/B5-B7/B8).
// Full render tests need real React Native; see TODO in jest.config.js.

jest.mock('../services/socketService', () => ({
  socketService: {
    setCallbacks: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: false,
    connectionType: null,
    pairingFailCount: 0,
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
}));

jest.mock('../services/storageService', () => ({
  getLastServer: jest.fn().mockResolvedValue(null),
  saveLastServer: jest.fn().mockResolvedValue(undefined),
  getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  saveAuthToken: jest.fn(),
  getAuthToken: jest.fn().mockResolvedValue(null),
  clearAuthToken: jest.fn(),
  getSettings: jest.fn().mockResolvedValue(null),
  saveSettings: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/bluetoothService', () => ({
  bluetoothService: {
    isAvailable: jest.fn().mockResolvedValue(false),
    startDiscovery: jest.fn().mockResolvedValue(false),
    cancelDiscovery: jest.fn(),
    getBondedDevices: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../services/notificationService', () => ({
  notificationService: {
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../config', () => ({
  ENABLE_CLOUD_DISCOVERY: false,
  CLOUD_DISCOVERY_API_URL: '',
}));

jest.mock('../theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      surface: '#111',
      text: '#eee',
      textMuted: '#888',
      primary: '#4488ff',
      success: '#22cc88',
      warning: '#ffaa00',
      danger: '#ff4455',
      border: '#333',
    },
    dark: true,
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../i18n/context', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    lang: 'vi',
  }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../navigation/types', () => ({}));

// react-native-paper resolves to its TS source in jest and touches
// safe-area internals at module load — stub it for load-only checks.
jest.mock('react-native-paper', () => ({
  Appbar: { Header: () => null, Content: () => null, Action: () => null },
  Card: () => null,
  Text: () => null,
  ActivityIndicator: () => null,
  useTheme: () => ({ colors: {} }),
}));

describe('mobile screen modules load (feat-matrix B rows)', () => {
  it('DashboardScreen loads and exports', () => {
    const mod = require('../screens/DashboardScreen');
    expect(typeof mod.DashboardScreen).toBe('function');
  });

  it('RemoteControlScreen loads and exports', () => {
    const mod = require('../screens/RemoteControlScreen');
    expect(typeof mod.RemoteControlScreen).toBe('function');
  });

  it('SettingsScreen loads and exports', () => {
    const mod = require('../screens/SettingsScreen');
    expect(typeof mod.SettingsScreen).toBe('function');
  });

  it('remote sub-modules load (preview/chat/action)', () => {
    const remote = require('../screens/remote');
    expect(typeof remote.RemoteChatPanel).toBe('function');
    expect(typeof remote.ScreenPreviewPanel).toBe('function');
    expect(typeof remote.RemoteActionBar).toBe('function');
  });

  it('pairing sub-modules load (discovery/code-input/wifi)', () => {
    const pairing = require('../screens/pairing');
    expect(pairing).toBeTruthy();
  });
});
