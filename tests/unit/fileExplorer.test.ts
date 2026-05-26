import { describe, it, expect, vi } from 'vitest';

// Mock all Tauri and React dependencies inside FileExplorer.tsx
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  mkdir: vi.fn(),
  writeTextFile: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('../../apps/desktop/src/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../apps/desktop/src/stores/appStore', () => ({
  useAppStore: {
    getState: () => ({
      setTerminalCwd: vi.fn(),
    }),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock react import since it will run in Node env
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(() => [[], vi.fn()]),
    useEffect: vi.fn(),
    useCallback: vi.fn((fn) => fn),
  };
});

import { detectLanguage } from '../../apps/desktop/src/components/FileExplorer.tsx';

describe('detectLanguage() in FileExplorer', () => {
  it('should detect languages from lowercase extensions correctly', () => {
    expect(detectLanguage('index.ts')).toBe('typescript');
    expect(detectLanguage('app.tsx')).toBe('typescriptreact');
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('package.json')).toBe('json');
    expect(detectLanguage('index.html')).toBe('html');
    expect(detectLanguage('style.css')).toBe('css');
  });

  it('should detect languages from uppercase extensions correctly (case-insensitive)', () => {
    expect(detectLanguage('index.TS')).toBe('typescript');
    expect(detectLanguage('app.TSX')).toBe('typescriptreact');
    expect(detectLanguage('main.PY')).toBe('python');
    expect(detectLanguage('package.JSON')).toBe('json');
    expect(detectLanguage('index.HTML')).toBe('html');
    expect(detectLanguage('style.CSS')).toBe('css');
  });

  it('should detect special files like Dockerfile or Makefile', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    expect(detectLanguage('dockerfile')).toBe('dockerfile');
    expect(detectLanguage('Makefile')).toBe('makefile');
    expect(detectLanguage('makefile')).toBe('makefile');
  });

  it('should fallback to plaintext when extension is unknown', () => {
    expect(detectLanguage('unknown.xyz')).toBe('plaintext');
    expect(detectLanguage('no-extension')).toBe('plaintext');
  });
});
