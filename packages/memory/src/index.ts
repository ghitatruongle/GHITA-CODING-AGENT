// ==============================================================================
// GHITA CODING AGENT - Memory Package
// ==============================================================================

import type { MemoryEntry, MemorySearchResult } from '@ghita/shared';
import { CrossSessionSearch } from './search.js';
import type { SessionRecord, CrossSessionResult } from './search.js';
import { MemoryNudgeEngine } from './nudge.js';
import type { NudgeSuggestion, NudgeConfig } from './nudge.js';

// --- Phase 4: Knowledge / RAG exports ---
export { KnowledgeEngine } from './knowledge/knowledge.js';
export type {
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSource,
  IngestOptions,
  SearchOptions as KnowledgeSearchOptions,
  KnowledgeSearchResult,
  EmbeddingFunction,
} from './knowledge/types.js';

// --- Phase 4: LLM Guardrail exports ---
export { LLMGuardrail } from './guardrail/guardrail.js';
export type { AuditLogEntry } from './guardrail/guardrail.js';
export type {
  GuardrailAction,
  GuardrailResult,
  GuardrailRule,
  GuardrailContext,
  PIIEntityType,
  LLMJudgeConfig,
  ContentFilterConfig,
  GuardrailConfig,
} from './guardrail/types.js';

export const MEMORY_VERSION = '0.1.0';

export interface RememberInput {
  type: MemoryEntry['type'];
  content: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export interface MemorySearchOptions {
  limit?: number;
  type?: MemoryEntry['type'];
  metadata?: Record<string, unknown>;
  minScore?: number;
}

export interface ContextInjectionOptions extends MemorySearchOptions {
  header?: string;
  maxCharacters?: number;
}

const TOKEN_PATTERN = /[\p{L}\p{N}_-]+/gu;

function generateMemoryId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function tokenize(value: string): Set<string> {
  const matches = value.toLowerCase().match(TOKEN_PATTERN) ?? [];
  return new Set(matches.filter((token) => token.length > 1));
}

function metadataMatches(
  entryMetadata: Record<string, unknown> | undefined,
  expected: Record<string, unknown> | undefined,
): boolean {
  if (!expected) return true;
  if (!entryMetadata) return false;

  for (const [key, value] of Object.entries(expected)) {
    if (entryMetadata[key] !== value) return false;
  }

  return true;
}

function scoreEntry(entry: MemoryEntry, queryTokens: Set<string>, now: number): number {
  const entryTokens = tokenize(entry.content);
  if (queryTokens.size === 0 || entryTokens.size === 0) return 0;

  let matches = 0;
  for (const token of queryTokens) {
    if (entryTokens.has(token)) matches += 1;
  }

  const tokenScore = matches / queryTokens.size;
  const ageMs = Math.max(0, now - entry.timestamp);
  const recencyScore = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 30));
  const explicitRelevance = entry.relevance ?? 0;

  return tokenScore * 0.7 + recencyScore * 0.2 + explicitRelevance * 0.1;
}

export class AgentMemory {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly sessionSearch: CrossSessionSearch;
  private readonly nudgeEngine: MemoryNudgeEngine;

  constructor(initialEntries: MemoryEntry[] = [], nudgeConfig?: Partial<NudgeConfig>) {
    for (const entry of initialEntries) {
      this.entries.set(entry.id, entry);
    }
    this.sessionSearch = new CrossSessionSearch();
    this.nudgeEngine = new MemoryNudgeEngine(nudgeConfig);
  }

  remember(input: RememberInput): MemoryEntry {
    const entry: MemoryEntry = {
      id: generateMemoryId(),
      type: input.type,
      content: input.content,
      metadata: input.metadata,
      timestamp: input.timestamp ?? Date.now(),
    };

    this.entries.set(entry.id, entry);
    return entry;
  }

  add(entry: MemoryEntry): MemoryEntry {
    this.entries.set(entry.id, entry);
    return entry;
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  list(type?: MemoryEntry['type']): MemoryEntry[] {
    const entries = [...this.entries.values()];
    const filtered = type ? entries.filter((entry) => entry.type === type) : entries;
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  forget(id: string): boolean {
    return this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  search(query: string, options: MemorySearchOptions = {}): MemorySearchResult[] {
    const queryTokens = tokenize(query);
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.05;
    const now = Date.now();
    const results: MemorySearchResult[] = [];

    for (const entry of this.entries.values()) {
      if (options.type && entry.type !== options.type) continue;
      if (!metadataMatches(entry.metadata, options.metadata)) continue;

      const score = scoreEntry(entry, queryTokens, now);
      if (score >= minScore) {
        results.push({ entry: { ...entry, relevance: score }, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  injectContext(query: string, options: ContextInjectionOptions = {}): string {
    const header = options.header ?? 'Relevant memory';
    const maxCharacters = options.maxCharacters ?? 3000;
    const memories = this.search(query, options);
    if (memories.length === 0) return '';

    const lines = [`${header}:`];
    for (const result of memories) {
      lines.push(`- [${result.entry.type}] ${result.entry.content}`);
    }

    const context = lines.join('\n');
    return context.length > maxCharacters ? `${context.slice(0, maxCharacters)}...` : context;
  }

  indexSession(session: SessionRecord): void {
    this.sessionSearch.indexSession(session);
  }

  searchAcrossSessions(
    query: string,
    options?: { limit?: number; minScore?: number; sessionType?: string }
  ): CrossSessionResult[] {
    return this.sessionSearch.searchAcrossSessions(query, options);
  }

  analyzeForNudges(messages: Array<{ role: string; content: string }>): NudgeSuggestion[] {
    return this.nudgeEngine.analyzeForNudges(messages);
  }

  autoSaveNudges(messages: Array<{ role: string; content: string }>): MemoryEntry[] {
    const nudges = this.analyzeForNudges(messages);
    const saved: MemoryEntry[] = [];
    for (const nudge of nudges) {
      if (this.nudgeEngine.shouldAutoSave(nudge)) {
        const entry = this.nudgeEngine.toMemoryEntry(nudge);
        this.add(entry);
        saved.push(entry);
      }
    }
    return saved;
  }

  toJSON(): MemoryEntry[] {
    return this.list();
  }

  static fromJSON(entries: MemoryEntry[]): AgentMemory {
    return new AgentMemory(entries);
  }
}

export { CrossSessionSearch } from './search.js';
export type { SessionRecord, SessionMessage, CrossSessionResult } from './search.js';
export { MemoryNudgeEngine } from './nudge.js';
export type { NudgeSuggestion, NudgeConfig, NudgePattern } from './nudge.js';
