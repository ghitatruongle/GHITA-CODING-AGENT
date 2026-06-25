// @vitest-environment happy-dom
// ==============================================================================
// GHITA CODING AGENT — useChatSessions Unit Tests
// ==============================================================================

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Resolve all pending microtasks so async effects settle within act(). */
async function flushAsync() {
  await act(() => Promise.resolve());
}

/** Resolve microtasks and advance timers so setTimeout(…, 50) in the hook fires. */
async function settleAsync() {
  await flushAsync();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}

// ─── Mocks ─────────────────────────────────────────────────────────────────

const loadChatSessionStateMock = vi.fn();
const saveChatSessionStateMock = vi.fn();

vi.mock('../utils/chatSessionStorage', () => ({
  loadChatSessionState: (...args: unknown[]) => loadChatSessionStateMock(...args),
  saveChatSessionState: (...args: unknown[]) => saveChatSessionStateMock(...args),
}));

vi.mock('@ghita/shared', () => ({
  generateUUID: () => `test-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
}));

// ─── Module under test ─────────────────────────────────────────────────────

import { useChatSessions } from './useChatSessions';
import type { ChatSession } from './useChatSessions';

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('useChatSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Default: storage is empty => create a new session
    loadChatSessionStateMock.mockResolvedValue({
      sessions: [],
      activeSessionId: null,
    });
    saveChatSessionStateMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Drain any leftover microtasks/timers so pending act() updates are flushed
    await settleAsync();
    vi.useRealTimers();
  });

  // ─── Initialization ───

  it('validates a correct session object via the hook', async () => {
    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      expect(result.current.sessions.length).toBeGreaterThan(0);
    });

    expect(result.current.sessions[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      messages: [],
      timestamp: expect.any(Number),
    });
  });

  it('creates a new session when storage is empty', async () => {
    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    expect(result.current.activeSessionId).toBeTruthy();
    expect(result.current.messages).toEqual([]);
    expect(result.current.currentView).toBe('chat');
  });

  // ─── Session CRUD ───

  it('selectSession switches to the correct session', async () => {
    loadChatSessionStateMock.mockResolvedValue({
      sessions: [
        {
          id: 's1',
          title: 'Session 1',
          messages: [{ id: 'm1', role: 'user', content: 'Hello', timestamp: 100 }],
          timestamp: 200,
        },
        {
          id: 's2',
          title: 'Session 2',
          messages: [{ id: 'm2', role: 'assistant', content: 'Hi', timestamp: 300 }],
          timestamp: 400,
        },
      ],
      activeSessionId: 's1',
    });

    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });
    expect(result.current.activeSessionId).toBe('s1');

    // Select s2
    act(() => {
      result.current.selectSession('s2');
    });

    await waitFor(() => {
      expect(result.current.activeSessionId).toBe('s2');
    });
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });
    expect(result.current.messages[0]?.content).toBe('Hi');
  });

  it('createSession adds a new session', async () => {
    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    const initialCount = result.current.sessions.length;

    act(() => {
      result.current.createSession();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(initialCount + 1);
    });
    expect(result.current.messages).toEqual([]);
  });

  // ─── Corrupted Data Handling ───

  it('filters out corrupted sessions on load', async () => {
    loadChatSessionStateMock.mockResolvedValue({
      sessions: [
        // Valid session
        { id: 'valid-1', title: 'Valid', messages: [], timestamp: 100 },
        // Corrupted: missing title
        { id: 'corrupt-1', messages: [], timestamp: 200 } as unknown as ChatSession,
        // Corrupted: messages is not an array
        {
          id: 'corrupt-2',
          title: 'Bad',
          messages: 'not-an-array',
          timestamp: 300,
        } as unknown as ChatSession,
        // Corrupted: missing id
        { title: 'No ID', messages: [], timestamp: 400 } as unknown as ChatSession,
        // Corrupted: message with invalid role
        {
          id: 'corrupt-3',
          title: 'Bad Msg',
          messages: [{ id: 'x', role: 'unknown-role', content: 'test', timestamp: 500 }],
          timestamp: 600,
        } as unknown as ChatSession,
      ],
      activeSessionId: 'valid-1',
    });

    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      // Only the valid session should survive
      expect(result.current.sessions.length).toBe(1);
    });

    expect(result.current.sessions[0]?.id).toBe('valid-1');
  });

  it('handles complete load failure by creating fresh session', async () => {
    loadChatSessionStateMock.mockRejectedValue(new Error('Storage corrupted!'));

    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      // Should recover by creating a fresh session
      expect(result.current.sessions.length).toBe(1);
    });

    expect(result.current.activeSessionId).toBeTruthy();
    expect(result.current.messages).toEqual([]);
  });

  it('updates session title from first user message', async () => {
    loadChatSessionStateMock.mockResolvedValue({
      sessions: [{ id: 'test', title: 'Cuộc trò chuyện mới', messages: [], timestamp: Date.now() }],
      activeSessionId: 'test',
    });

    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    // Add a user message
    act(() => {
      result.current.setMessages([
        {
          id: 'msg1',
          role: 'user' as const,
          content: 'Hello world from AI',
          timestamp: Date.now(),
        },
      ]);
    });

    // Title should be updated (default title detected -> replaced with first user message)
    await waitFor(() => {
      expect(result.current.sessions[0]?.title).toBe('Hello world from AI');
    });
  });

  it('truncates long titles', async () => {
    loadChatSessionStateMock.mockResolvedValue({
      sessions: [{ id: 'test', title: 'Cuộc trò chuyện mới', messages: [], timestamp: Date.now() }],
      activeSessionId: 'test',
    });

    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    const longMessage = 'A'.repeat(50);

    act(() => {
      result.current.setMessages([
        { id: 'msg1', role: 'user' as const, content: longMessage, timestamp: Date.now() },
      ]);
    });

    await waitFor(() => {
      expect(result.current.sessions[0]?.title).toBe(`${'A'.repeat(25)  }...`);
    });
  });

  it('selects first session if activeSessionId is invalid', async () => {
    loadChatSessionStateMock.mockResolvedValue({
      sessions: [
        { id: 's1', title: 'First', messages: [], timestamp: 100 },
        { id: 's2', title: 'Second', messages: [], timestamp: 200 },
      ],
      activeSessionId: 'non-existent',
    });

    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    // Wait until the hook falls back to the first valid session
    await waitFor(() => {
      expect(result.current.activeSessionId).toBe('s1');
    });
  });

  it('toggles currentView between chat and history', async () => {
    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      expect(result.current.currentView).toBe('chat');
    });

    act(() => {
      result.current.setCurrentView('history');
    });
    expect(result.current.currentView).toBe('history');

    act(() => {
      result.current.setCurrentView('chat');
    });
    expect(result.current.currentView).toBe('chat');
  });

  it('does not switch session if target session does not exist', async () => {
    loadChatSessionStateMock.mockResolvedValue({
      sessions: [{ id: 's1', title: 'Only', messages: [], timestamp: 100 }],
      activeSessionId: 's1',
    });

    const { result } = renderHook(() => useChatSessions());
    await flushAsync();

    await waitFor(() => {
      expect(result.current.activeSessionId).toBe('s1');
    });

    // Try selecting a non-existent session should be a no-op
    act(() => {
      result.current.selectSession('non-existent');
    });

    await waitFor(() => {
      expect(result.current.activeSessionId).toBe('s1');
    });
  });
});
