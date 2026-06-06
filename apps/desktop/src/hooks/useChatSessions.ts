import { useEffect, useRef, useState, useCallback } from 'react';
import { generateUUID } from '@ghita/shared';
import { loadChatSessionState, saveChatSessionState } from '../utils/chatSessionStorage';
import { useTranslation } from '../i18n';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  mcpCard?: { tool: string; server: string; result: string; isError?: boolean };
  searchCard?: { query: string; results: Array<{ title: string; url: string; snippet: string }> };
  imageAttachment?: string;
  computerUsePreview?: {
    screenshot: string;
    point?: { x: number; y: number };
    box?: { x1: number; y1: number; x2: number; y2: number };
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
}

// Known default titles across all locales (for detecting auto-generated titles)
const KNOWN_DEFAULT_TITLES = [
  'Cuộc trò chuyện mới',
  'New Chat',
  'Start New Conversation',
  'Tạo cuộc hội thoại mới',
  '新聊天',
  '创建新会话',
];

// Validate session object shape to detect corrupted data
function isValidSession(s: unknown): s is ChatSession {
  if (!s || typeof s !== 'object') return false;
  const obj = s as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id) return false;
  if (typeof obj.title !== 'string') return false;
  if (!Array.isArray(obj.messages)) return false;
  if (typeof obj.timestamp !== 'number') return false;
  // Validate each message has required fields
  for (const msg of obj.messages) {
    if (!msg || typeof msg !== 'object') return false;
    const m = msg as Record<string, unknown>;
    if (typeof m.id !== 'string' || !m.id) return false;
    if (m.role !== 'user' && m.role !== 'assistant') return false;
    if (typeof m.content !== 'string') return false;
  }
  return true;
}

export function useChatSessions() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [currentView, setCurrentView] = useState<'chat' | 'history'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const isSwitchingRef = useRef(false);

  const persist = useCallback(async (s: ChatSession[], activeId: string | null) => {
    try {
      await saveChatSessionState({ sessions: s, activeSessionId: activeId });
    } catch (error) {
      console.error('[useChatSessions] Failed to persist:', error);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const state = await loadChatSessionState<ChatSession>();
        if (!active) return;
        // Validate and filter out corrupted sessions
        const validSessions = Array.isArray(state.sessions)
          ? state.sessions.filter(isValidSession)
          : [];
        if (validSessions.length > 0) {
          setSessions(validSessions);
          const activeId =
            state.activeSessionId && validSessions.some((s) => s.id === state.activeSessionId)
              ? state.activeSessionId
              : (validSessions[0]?.id ?? '');
          setActiveSessionId(activeId);
          const activeSess = validSessions.find((s) => s.id === activeId);
          if (activeSess) setMessages(activeSess.messages);
          return;
        }
      } catch (e) {
        console.error('[useChatSessions] Load failed, resetting to fresh state:', e);
        // If load crashes completely (e.g. catastrophic corruption), clear all data
        try {
          localStorage.removeItem('ghita_chat_sessions');
          localStorage.removeItem('ghita_active_session_id');
        } catch {
          /* ignore */
        }
      }
      if (!active) return;
      const id = generateUUID();
      const sess: ChatSession = {
        id,
        title: t('chat.newChat'),
        messages: [],
        timestamp: Date.now(),
      };
      setSessions([sess]);
      setActiveSessionId(id);
      setMessages([]);
      void persist([sess], id);
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId || sessions.length === 0 || isSwitchingRef.current) return;
    // Skip persist while streaming is active (streaming-message present)
    // This prevents 30+ Tauri IPC calls per second during AI streaming
    const hasStreaming = messages.some((m) => m.id === 'streaming-message');
    if (hasStreaming) return;
    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        let newTitle = s.title;
        const isDefault = KNOWN_DEFAULT_TITLES.some(
          (dt) => dt === s.title || dt === s.title.trim(),
        );
        if (isDefault) {
          const firstUser = messages.find((m) => m.role === 'user');
          if (firstUser?.content.trim()) {
            const txt = firstUser.content.trim();
            newTitle = txt.length > 25 ? txt.substring(0, 25) + '...' : txt;
          }
        }
        return { ...s, messages, title: newTitle, timestamp: Date.now() };
      });
      const sorted = [...updated].sort((a, b) => b.timestamp - a.timestamp);
      void persist(sorted, activeSessionId);
      return sorted;
    });
  }, [messages, activeSessionId]);

  const selectSession = useCallback(
    (sessionId: string) => {
      const target = sessions.find((s) => s.id === sessionId);
      if (!target) return;
      isSwitchingRef.current = true;
      setActiveSessionId(sessionId);
      setMessages(target.messages);
      setCurrentView('chat');
      void persist(sessions, sessionId);
      setTimeout(() => {
        isSwitchingRef.current = false;
      }, 50);
    },
    [sessions, persist],
  );

  const createSession = useCallback(() => {
    const id = generateUUID();
    const sess: ChatSession = { id, title: t('chat.newChat'), messages: [], timestamp: Date.now() };
    isSwitchingRef.current = true;
    const next = [sess, ...sessions];
    setSessions(next);
    setActiveSessionId(id);
    setMessages([]);
    setCurrentView('chat');
    void persist(next, id);
    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 50);
  }, [sessions, persist]);

  const deleteSession = useCallback(
    (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = sessions.filter((s) => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        if (updated.length > 0) {
          const nextActive = updated[0];
          if (!nextActive) return;
          isSwitchingRef.current = true;
          setSessions(updated);
          setActiveSessionId(nextActive.id);
          setMessages(nextActive.messages);
          setCurrentView('chat');
          void persist(updated, nextActive.id);
          setTimeout(() => {
            isSwitchingRef.current = false;
          }, 50);
        } else {
          const id = generateUUID();
          const sess: ChatSession = {
            id,
            title: t('chat.newChat'),
            messages: [],
            timestamp: Date.now(),
          };
          setSessions([sess]);
          setActiveSessionId(id);
          setMessages([]);
          setCurrentView('chat');
          void persist([sess], id);
        }
      } else {
        setSessions(updated);
        void persist(updated, activeSessionId);
      }
    },
    [sessions, activeSessionId, persist, t],
  );

  return {
    sessions,
    activeSessionId,
    currentView,
    setCurrentView,
    messages,
    setMessages,
    selectSession,
    createSession,
    deleteSession,
  };
}
