// ==============================================================================
// GHITA CODING AGENT - Mobile PairingScreen Smoke Tests
// Verifies the screen module loads and exports PairingScreen.
// Full render tests need real React Native; see TODO in jest.config.js.
// ==============================================================================

jest.mock('../services/socketService', () => ({
  socketService: {
    setCallbacks: jest.fn(),
    connect: jest.fn(),
    isConnected: false,
    connectionType: null,
    pairingFailCount: 0,
  },
}));

jest.mock('../services/storageService', () => ({
  getLastServer: jest.fn().mockResolvedValue(null),
  saveLastServer: jest.fn().mockResolvedValue(undefined),
  getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  saveAuthToken: jest.fn(),
  getAuthToken: jest.fn().mockResolvedValue(null),
  clearAuthToken: jest.fn(),
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
  CLOUD_DISCOVERY_API_KEY: '',
}));

jest.mock('../theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primary: '#6366f1',
      background: '#0f172a',
      backgroundSecondary: '#1e293b',
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#64748b',
      border: '#334155',
      accent: '#ec4899',
      success: '#10b981',
      error: '#f43f5e',
    },
    isDark: true,
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

describe('PairingScreen module', () => {
  it('loads without throwing', () => {
    expect(() => {
      void require('../screens/PairingScreen');
    }).not.toThrow();
  });

  it('exports a PairingScreen component', () => {
    const mod = require('../screens/PairingScreen');
    expect(typeof mod.PairingScreen).toBe('function');
  });
});
