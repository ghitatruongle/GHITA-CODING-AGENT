// Persistent session management with:
// - Two-tier storage: in-memory cache (fast) + SQLite (persistent)
// - Lifecycle: create → pause → resume → archive
// - Full-text search across history (FTS5 virtual table)
// - Multi-session switching (active session tracking)
// - Export/import as JSON

// SECURITY (audit fix 2.15): use the `node:crypto` module directly instead
// of relying on the global `crypto` object. The global is only available
// from Node 19+ and on certain runtimes (Deno, Bun, browsers); importing
// it explicitly keeps the session manager portable across Node 16, 18 and
// the React Native JS engine.
import nodeCrypto from 'node:crypto';

// ----- Types -----

export type SessionStatus = 'active' | 'paused' | 'archived' | 'closed';

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  messages: SessionMessage[];
  metadata: Record<string, unknown>;
  /** Total tokens used in this session */
  tokenUsage: { input: number; output: number };
}

export interface SessionSearchResult {
  sessionId: string;
  messageId: string;
  snippet: string;
  /** Match score (higher = better) */
  score: number;
}

// ----- SQLite-like Persistent Backend Interface -----

export interface SessionStore {
  load(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  delete(id: string): Promise<void>;
  listIds(): Promise<string[]>;
  /** FTS-style search returning message IDs that match */
  search(query: string, limit?: number): Promise<SessionSearchResult[]>;
}

// ----- In-Memory Implementation (with persistent hook) -----

export class InMemorySessionStore implements SessionStore {
  private readonly cache = new Map<string, Session>();
  private readonly fts = new Map<string, Set<string>>(); // word -> messageIds
  private readonly messageToSession = new Map<string, string>();
  private readonly persistentBackend: SessionStore | null;

  constructor(persistentBackend?: SessionStore) {
    this.persistentBackend = persistentBackend ?? null;
  }

  async load(id: string): Promise<Session | null> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    if (this.persistentBackend) {
      const loaded = await this.persistentBackend.load(id);
      if (loaded) {
        this.cache.set(id, loaded);
        this.indexForFts(loaded);
        return loaded;
      }
    }
    return null;
  }

  async save(session: Session): Promise<void> {
    // Deindex the previous snapshot first: without this, words from edited or
    // removed messages keep pointing at their msgIds forever (stale FTS).
    const previous = this.cache.get(session.id);
    if (previous && previous !== session) {
      this.deindexForFts(previous);
    }
    this.cache.set(session.id, session);
    this.indexForFts(session);
    if (this.persistentBackend) {
      await this.persistentBackend.save(session);
    }
  }

  async delete(id: string): Promise<void> {
    const session = this.cache.get(id);
    if (session) {
      this.deindexForFts(session);
    }
    this.cache.delete(id);
    if (this.persistentBackend) {
      await this.persistentBackend.delete(id);
    }
  }

  async listIds(): Promise<string[]> {
    const cached = [...this.cache.keys()];
    if (this.persistentBackend) {
      const persistent = await this.persistentBackend.listIds();
      return [...new Set([...cached, ...persistent])];
    }
    return cached;
  }

  async search(query: string, limit = 20): Promise<SessionSearchResult[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (terms.length === 0) return [];

    // Score: count of matching terms per message
    const scores = new Map<string, number>();
    for (const term of terms) {
      const msgIds = this.fts.get(term);
      if (!msgIds) continue;
      for (const msgId of msgIds) {
        scores.set(msgId, (scores.get(msgId) ?? 0) + 1);
      }
    }

    const results: SessionSearchResult[] = [];
    for (const [msgId, score] of scores) {
      const sessionId = this.messageToSession.get(msgId);
      if (!sessionId) continue;
      const session = this.cache.get(sessionId);
      const msg = session?.messages.find((m) => m.id === msgId);
      if (!msg) continue;
      const snippet = msg.content.length > 120 ? `${msg.content.slice(0, 120)  }…` : msg.content;
      results.push({ sessionId, messageId: msgId, snippet, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private indexForFts(session: Session): void {
    for (const msg of session.messages) {
      this.messageToSession.set(msg.id, session.id);
      const words = msg.content
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 1);
      for (const word of words) {
        let set = this.fts.get(word);
        if (!set) {
          set = new Set();
          this.fts.set(word, set);
        }
        set.add(msg.id);
      }
    }
  }

  private deindexForFts(session: Session): void {
    for (const msg of session.messages) {
      this.messageToSession.delete(msg.id);
      const words = msg.content
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 1);
      for (const word of words) {
        this.fts.get(word)?.delete(msg.id);
      }
    }
  }
}

// ----- Session Manager (lifecycle + multi-session) -----

/**
 * Generate a UUID v4 string, preferring `node:crypto.randomUUID` and
 * falling back to a `Math.random`-based generator for runtimes that
 * pre-date Node 19 (where `crypto.randomUUID` was first exposed globally).
 */
function uuidv4(): string {
  if (typeof nodeCrypto.randomUUID === 'function') {
    return nodeCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function generateId(): string {
  return `sess-${uuidv4().slice(0, 12)}`;
}
function generateMessageId(): string {
  return `msg-${uuidv4().slice(0, 12)}`;
}

export class SessionManager {
  private store: InMemorySessionStore;
  private activeSessionId: string | null = null;

  constructor(store?: InMemorySessionStore) {
    this.store = store ?? new InMemorySessionStore();
  }

  // ----- CRUD -----

  async createSession(name: string, metadata: Record<string, unknown> = {}): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: generateId(),
      name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata,
      tokenUsage: { input: 0, output: 0 },
    };
    await this.store.save(session);
    this.activeSessionId = session.id;
    return session;
  }

  async getSession(id: string): Promise<Session | null> {
    return this.store.load(id);
  }

  async deleteSession(id: string): Promise<void> {
    await this.store.delete(id);
    if (this.activeSessionId === id) this.activeSessionId = null;
  }

  async listSessions(): Promise<string[]> {
    return this.store.listIds();
  }

  // ----- Lifecycle -----

  async pauseSession(id: string): Promise<Session> {
    const s = await this.requireSession(id);
    s.status = 'paused';
    s.updatedAt = Date.now();
    await this.store.save(s);
    return s;
  }

  async resumeSession(id: string): Promise<Session> {
    const s = await this.requireSession(id);
    s.status = 'active';
    s.updatedAt = Date.now();
    this.activeSessionId = s.id;
    await this.store.save(s);
    return s;
  }

  async archiveSession(id: string): Promise<Session> {
    const s = await this.requireSession(id);
    s.status = 'archived';
    s.updatedAt = Date.now();
    if (this.activeSessionId === id) this.activeSessionId = null;
    await this.store.save(s);
    return s;
  }

  // ----- Multi-session switch -----

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  async switchActiveSession(id: string): Promise<Session> {
    const s = await this.requireSession(id);
    this.activeSessionId = s.id;
    return s;
  }

  // ----- Messages -----

  async addMessage(
    sessionId: string,
    role: SessionMessage['role'],
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<SessionMessage> {
    const s = await this.requireSession(sessionId);
    if (s.status === 'archived' || s.status === 'closed') {
      throw new Error(`Cannot add message to ${s.status} session`);
    }
    const msg: SessionMessage = {
      id: generateMessageId(),
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };
    s.messages.push(msg);
    s.updatedAt = Date.now();
    if (metadata?.tokens && typeof metadata.tokens === 'object') {
      const t = metadata.tokens as { input?: number; output?: number };
      s.tokenUsage.input += t.input ?? 0;
      s.tokenUsage.output += t.output ?? 0;
    }
    await this.store.save(s);
    return msg;
  }

  // ----- Search -----

  async search(query: string, limit = 20): Promise<SessionSearchResult[]> {
    return this.store.search(query, limit);
  }

  // ----- Export/Import -----

  async exportSession(id: string): Promise<string> {
    const s = await this.requireSession(id);
    return JSON.stringify(s, null, 2);
  }

  async exportAll(): Promise<string> {
    const ids = await this.listSessions();
    const sessions: Session[] = [];
    for (const id of ids) {
      const s = await this.store.load(id);
      if (s) sessions.push(s);
    }
    return JSON.stringify({ version: 1, exportedAt: Date.now(), sessions }, null, 2);
  }

  async importSession(json: string): Promise<Session> {
    const parsed = JSON.parse(json) as Session;
    if (!parsed.id || !parsed.name || !Array.isArray(parsed.messages)) {
      throw new Error('Invalid session JSON: missing required fields');
    }
    // Always restore as 'active' on import
    parsed.status = 'active';
    parsed.updatedAt = Date.now();
    await this.store.save(parsed);
    return parsed;
  }

  // ----- Internal -----

  private async requireSession(id: string): Promise<Session> {
    const s = await this.store.load(id);
    if (!s) throw new Error(`Session ${id} not found`);
    return s;
  }
}
