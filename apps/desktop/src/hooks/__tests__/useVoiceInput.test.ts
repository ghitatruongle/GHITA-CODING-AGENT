// useVoiceInput hook tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceInput, detectVoiceSupport } from '../useVoiceInput';

interface Result {
  0: { transcript: string; confidence: number };
  isFinal: boolean;
}
interface Results {
  [index: number]: Result;
  length: number;
}
interface ResultEvent {
  results: Results;
  resultIndex: number;
}
interface ErrorEvent {
  error: string;
}

class MockRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  onresult: ((e: ResultEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  start(): void {
    this.started = true;
  }
  stop(): void {
    this.started = false;
    if (this.onend) this.onend();
  }
  abort(): void {
    this.started = false;
  }

  // Test helpers
  emitResult(text: string): void {
    if (this.onresult) {
      this.onresult({
        results: [[{ transcript: text, confidence: 1 }]] as unknown as Results,
        resultIndex: 0,
      });
    }
  }
  emitError(error: string): void {
    if (this.onerror) this.onerror({ error });
  }
}

describe('detectVoiceSupport', () => {
  afterEach(() => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it('returns supported when SpeechRecognition is present', () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = MockRecognition;
    expect(detectVoiceSupport()).toBe('supported');
  });

  it('returns webkit-only when only webkitSpeechRecognition is present', () => {
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      MockRecognition;
    expect(detectVoiceSupport()).toBe('webkit-only');
  });

  it('returns unsupported when neither is present', () => {
    expect(detectVoiceSupport()).toBe('unsupported');
  });
});

describe('useVoiceInput', () => {
  let mockRec: MockRecognition;

  beforeEach(() => {
    mockRec = new MockRecognition();
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = function () {
      return mockRec;
    };
  });

  afterEach(() => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it('reports supported when SpeechRecognition is available', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.support).toBe('supported');
  });

  it('starts listening when start() is called', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.start();
    });
    expect(result.current.listening).toBe(true);
    expect(mockRec.started).toBe(true);
  });

  it('stops listening when stop() is called', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.listening).toBe(false);
  });

  it('updates transcript when result event fires', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.start();
    });
    act(() => {
      mockRec.emitResult('hello world');
    });
    expect(result.current.transcript).toBe('hello world');
  });

  it('captures error and stops listening', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.start();
    });
    act(() => {
      mockRec.emitError('not-allowed');
    });
    expect(result.current.error).toBe('not-allowed');
    expect(result.current.listening).toBe(false);
  });

  it('reset() clears transcript and error', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => {
      result.current.start();
    });
    act(() => {
      mockRec.emitResult('something');
    });
    act(() => {
      mockRec.emitError('oops');
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('reports unsupported + error when SpeechRecognition absent', () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.support).toBe('unsupported');
    expect(result.current.error).toMatch(/not supported/i);
  });
});
