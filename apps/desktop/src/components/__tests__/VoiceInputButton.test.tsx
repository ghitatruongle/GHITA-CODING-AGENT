// ==============================================================================
// VoiceInputButton component tests (smoke tests)
// ==============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

interface MockReturn {
  listening: boolean;
  transcript: string;
  error: string | null;
  support: 'supported' | 'webkit-only' | 'unsupported';
  start: () => void;
  stop: () => void;
  reset: () => void;
}

let mockReturn: MockReturn = {
  listening: false,
  transcript: '',
  error: null,
  support: 'supported',
  start: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
};

vi.mock('../../hooks/useVoiceInput', () => ({
  useVoiceInput: () => mockReturn,
}));

vi.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const map: Record<string, string> = {
        'voice.start': 'Voice',
        'voice.stop': 'Stop',
        'voice.listening': 'Listening…',
        'voice.unsupported': 'Not supported',
        'voice.unsupportedHint': 'Speech recognition unavailable',
      };
      return map[key] ?? fallback ?? key;
    },
    lang: 'en',
  }),
}));

import { VoiceInputButton } from '../VoiceInputButton';

describe('VoiceInputButton smoke tests', () => {
  beforeEach(() => {
    mockReturn = {
      listening: false,
      transcript: '',
      error: null,
      support: 'supported',
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    };
  });

  it('renders without crashing', () => {
    const { container } = render(<VoiceInputButton onResult={vi.fn()} />);
    expect(container.querySelector('button')).toBeTruthy();
  });

  it('renders disabled when unsupported', () => {
    mockReturn = { ...mockReturn, support: 'unsupported' };
    const { container } = render(<VoiceInputButton onResult={vi.fn()} />);
    const btn = container.querySelector('button');
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });

  it('renders mic icon', () => {
    const { container } = render(<VoiceInputButton onResult={vi.fn()} />);
    // Lucide icons render as SVGs
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('does not throw on click', () => {
    const { container } = render(<VoiceInputButton onResult={vi.fn()} />);
    const btn = container.querySelector('button');
    expect(() => {
      if (btn instanceof HTMLElement) btn.click();
    }).not.toThrow();
  });
});
