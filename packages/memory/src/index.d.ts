import type { MemoryEntry, MemorySearchResult } from '@ghita/shared';
import type { SessionRecord, CrossSessionResult } from './search.js';
import type { NudgeSuggestion, NudgeConfig } from './nudge.js';
export { KnowledgeEngine } from './knowledge/knowledge.js';
export type { KnowledgeDocument, KnowledgeChunk, KnowledgeSource, IngestOptions, SearchOptions as KnowledgeSearchOptions, KnowledgeSearchResult, EmbeddingFunction, } from './knowledge/types.js';
export { LLMGuardrail } from './guardrail/guardrail.js';
export type { AuditLogEntry } from './guardrail/guardrail.js';
export type { GuardrailAction, GuardrailResult, GuardrailRule, GuardrailContext, PIIEntityType, LLMJudgeConfig, ContentFilterConfig, GuardrailConfig, } from './guardrail/types.js';
export declare const MEMORY_VERSION = "0.1.0";
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
export declare class AgentMemory {
    private readonly entries;
    private readonly sessionSearch;
    private readonly nudgeEngine;
    constructor(initialEntries?: MemoryEntry[], nudgeConfig?: Partial<NudgeConfig>);
    remember(input: RememberInput): MemoryEntry;
    add(entry: MemoryEntry): MemoryEntry;
    get(id: string): MemoryEntry | undefined;
    list(type?: MemoryEntry['type']): MemoryEntry[];
    forget(id: string): boolean;
    clear(): void;
    search(query: string, options?: MemorySearchOptions): MemorySearchResult[];
    injectContext(query: string, options?: ContextInjectionOptions): string;
    indexSession(session: SessionRecord): void;
    searchAcrossSessions(query: string, options?: {
        limit?: number;
        minScore?: number;
        sessionType?: string;
    }): CrossSessionResult[];
    analyzeForNudges(messages: Array<{
        role: string;
        content: string;
    }>): NudgeSuggestion[];
    autoSaveNudges(messages: Array<{
        role: string;
        content: string;
    }>): MemoryEntry[];
    toJSON(): MemoryEntry[];
    static fromJSON(entries: MemoryEntry[]): AgentMemory;
}
export { CrossSessionSearch } from './search.js';
export type { SessionRecord, SessionMessage, CrossSessionResult } from './search.js';
export { MemoryNudgeEngine } from './nudge.js';
export type { NudgeSuggestion, NudgeConfig, NudgePattern } from './nudge.js';
export { RustMemoryAddon } from './semantic/rustAddon.js';
export type { ChatLogEntry, CacheEntry } from './semantic/rustAddon.js';
//# sourceMappingURL=index.d.ts.map