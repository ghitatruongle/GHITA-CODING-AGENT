import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('chat session storage', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it('loads sessions from Tauri storage when available', async () => {
    invokeMock.mockResolvedValue({
      sessions: [{ id: 's1', title: 'Session', messages: [], timestamp: 1 }],
      activeSessionId: 's1',
    });

    const { loadChatSessionState } = await import('./chatSessionStorage');
    const result = await loadChatSessionState<{ id: string; title: string; messages: []; timestamp: number }>();

    expect(result.sessions).toHaveLength(1);
    expect(result.activeSessionId).toBe('s1');
  });

  it('falls back to localStorage and migrates data', async () => {
    localStorage.setItem('ghita_chat_sessions', JSON.stringify([{ id: 'legacy' }]));
    localStorage.setItem('ghita_active_session_id', 'legacy');
    invokeMock.mockRejectedValueOnce(new Error('tauri unavailable'));
    invokeMock.mockResolvedValueOnce(undefined);

    const { loadChatSessionState } = await import('./chatSessionStorage');
    const result = await loadChatSessionState<{ id: string }>();

    expect(result.sessions).toEqual([{ id: 'legacy' }]);
    expect(result.activeSessionId).toBe('legacy');
    expect(invokeMock).toHaveBeenLastCalledWith('save_chat_sessions', {
      payload: {
        sessions: [{ id: 'legacy' }],
        activeSessionId: 'legacy',
      },
    });
  });
});
