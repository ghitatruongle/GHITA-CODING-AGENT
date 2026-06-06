import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TieredMemoryStore, getDeterministicMockEmbedding } from '../src/tieredStore.js';
import { AgentMemory } from '../src/index.js';
import type { MemoryEntry } from '@ghita/shared';

describe('TieredMemoryStore & AgentMemory Tiered Storage (Phase 15)', () => {
  let store: TieredMemoryStore;

  beforeEach(() => {
    // Initialize with a working memory capacity of 3 for easy testing
    store = new TieredMemoryStore({
      dbPath: ':memory:',
      maxWorkingMemorySize: 3,
      promotionAccessThreshold: 3,
      promotionImportanceThreshold: 0.7,
    });
  });

  afterEach(() => {
    store.close();
  });

  it('should add and retrieve memories from Tier 1', () => {
    const entry: MemoryEntry = {
      id: 'mem_1',
      type: 'fact',
      content: 'GHITA is an AI coding agent.',
      timestamp: Date.now(),
      metadata: { _importance: 0.5 },
    };

    const added = store.add(entry);
    expect(added.id).toBe('mem_1');

    const retrieved = store.get('mem_1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.content).toBe(entry.content);
    expect(store.getWorkingMemorySize()).toBe(1);
  });

  it('should evict least-utility memory to Tier 2 (SQLite) when capacity is exceeded', () => {
    const entry1: MemoryEntry = {
      id: 'mem_1',
      type: 'fact',
      content: 'Python is interpreted.',
      timestamp: Date.now() - 5000,
      metadata: { _importance: 0.4, _accessCount: 1 },
    };
    const entry2: MemoryEntry = {
      id: 'mem_2',
      type: 'fact',
      content: 'Rust is compiled.',
      timestamp: Date.now() - 1000,
      metadata: { _importance: 0.9, _accessCount: 1 },
    };
    const entry3: MemoryEntry = {
      id: 'mem_3',
      type: 'fact',
      content: 'TypeScript is statically typed.',
      timestamp: Date.now(),
      metadata: { _importance: 0.6, _accessCount: 1 },
    };

    store.add(entry1);
    store.add(entry2);
    store.add(entry3);

    expect(store.getWorkingMemorySize()).toBe(3);
    expect(store.getDatabaseCount()).toBe(0); // None evicted yet

    // Add 4th item to trigger eviction
    const entry4: MemoryEntry = {
      id: 'mem_4',
      type: 'fact',
      content: 'JavaScript is dynamically typed.',
      timestamp: Date.now(),
      metadata: { _importance: 0.8 },
    };
    store.add(entry4);

    // Working memory size should remain 3
    expect(store.getWorkingMemorySize()).toBe(3);

    // One entry should be demoted/evicted to SQLite
    expect(store.getDatabaseCount()).toBe(1);

    // mem_1 should be evicted because it has the lowest importance (0.4) and is the oldest
    const retrievedEvicted = store.get('mem_1');
    expect(retrievedEvicted).toBeDefined();
    expect(retrievedEvicted?.id).toBe('mem_1');

    // Getting it should promote it back to Tier 1, triggering another eviction
    expect(store.getWorkingMemorySize()).toBe(3);
  });

  it('should promote entry to Tier 3 (Vector store) if it is highly important', () => {
    const entry: MemoryEntry = {
      id: 'mem_important',
      type: 'preference',
      content: 'User prefers dark mode interfaces.',
      timestamp: Date.now(),
      metadata: { _importance: 0.8 },
    };

    store.add(entry);

    // Query Tier 3 using semantic search
    const results = store.search('dark mode', { limit: 1 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.id).toBe('mem_important');
  });

  it('should promote entry to Tier 3 if accessed frequently', () => {
    const entry: MemoryEntry = {
      id: 'mem_frequent',
      type: 'fact',
      content: 'This memory gets read very often.',
      timestamp: Date.now(),
      metadata: { _importance: 0.3 },
    };

    store.add(entry);

    // Access it multiple times to trigger promotion to Tier 3
    store.get('mem_frequent');
    store.get('mem_frequent');
    store.get('mem_frequent');

    // Semantic search should find it now that it has been promoted to Tier 3
    const results = store.search('often', { limit: 1 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.id).toBe('mem_frequent');
  });

  it('should delete a memory from all tiers using forget', () => {
    const entry: MemoryEntry = {
      id: 'mem_delete',
      type: 'fact',
      content: 'Temporary draft notes.',
      timestamp: Date.now(),
      metadata: { _importance: 0.8 }, // goes to Tier 3
    };

    store.add(entry);
    
    // Evict it to Tier 2 by adding others
    store.add({ id: 'a', type: 'fact', content: 'a', timestamp: Date.now() });
    store.add({ id: 'b', type: 'fact', content: 'b', timestamp: Date.now() });
    store.add({ id: 'c', type: 'fact', content: 'c', timestamp: Date.now() });

    // Verify it is not in Tier 1 but exists in store (Tier 2/3)
    expect(store.get('mem_delete')).toBeDefined();

    // Delete it
    const success = store.forget('mem_delete');
    expect(success).toBe(true);

    // Should not be found anywhere anymore
    expect(store.get('mem_delete')).toBeUndefined();
  });

  it('should search across tiers using AgentMemory integration', () => {
    const agentMemory = new AgentMemory([], {}, {
      dbPath: ':memory:',
      maxWorkingMemorySize: 2,
    });

    agentMemory.add({
      id: 'm1',
      type: 'fact',
      content: 'GHITA stands for Global Hybrid Intelligent Technology Agent.',
      timestamp: Date.now(),
    });
    agentMemory.add({
      id: 'm2',
      type: 'fact',
      content: 'Agentic workflows are iterative.',
      timestamp: Date.now(),
    });
    // This addition evicts m1 to Tier 2 (SQLite)
    agentMemory.add({
      id: 'm3',
      type: 'fact',
      content: 'Compaction runs in the background.',
      timestamp: Date.now(),
    });

    const searchResults = agentMemory.search('GHITA');
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0]?.entry.content).toContain('Global Hybrid');
  });
});
