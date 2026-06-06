import { invoke } from '@tauri-apps/api/core';

const CHAT_SESSIONS_STORAGE_KEY = 'ghita_chat_sessions';
const ACTIVE_CHAT_SESSION_STORAGE_KEY = 'ghita_active_session_id';

export interface PersistedChatSessionState<TSession> {
  sessions: TSession[];
  activeSessionId: string | null;
}

function loadLegacyState<TSession>(): PersistedChatSessionState<TSession> {
  try {
    const raw = localStorage.getItem(CHAT_SESSIONS_STORAGE_KEY);
    const activeSessionId = localStorage.getItem(ACTIVE_CHAT_SESSION_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TSession[]) : [];
    return {
      sessions: Array.isArray(parsed) ? parsed : [],
      activeSessionId,
    };
  } catch {
    return {
      sessions: [],
      activeSessionId: null,
    };
  }
}

function saveLegacyState<TSession>(state: PersistedChatSessionState<TSession>): void {
  localStorage.setItem(CHAT_SESSIONS_STORAGE_KEY, JSON.stringify(state.sessions));
  if (state.activeSessionId) {
    localStorage.setItem(ACTIVE_CHAT_SESSION_STORAGE_KEY, state.activeSessionId);
  } else {
    localStorage.removeItem(ACTIVE_CHAT_SESSION_STORAGE_KEY);
  }
}

export async function loadChatSessionState<TSession>(): Promise<
  PersistedChatSessionState<TSession>
> {
  try {
    const state = await invoke<PersistedChatSessionState<TSession>>('load_chat_sessions');
    if (state && Array.isArray(state.sessions)) {
      return {
        sessions: state.sessions,
        activeSessionId: state.activeSessionId ?? null,
      };
    }
  } catch {
    // Fall back to legacy localStorage below.
  }

  const legacy = loadLegacyState<TSession>();
  if (legacy.sessions.length > 0) {
    await saveChatSessionState(legacy);
  }
  return legacy;
}

export async function saveChatSessionState<TSession>(
  state: PersistedChatSessionState<TSession>,
): Promise<void> {
  try {
    await invoke('save_chat_sessions', { payload: state });
    localStorage.removeItem(CHAT_SESSIONS_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_CHAT_SESSION_STORAGE_KEY);
  } catch {
    saveLegacyState(state);
  }
}
