import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RustMemoryAddon } from '../src/semantic/rustAddon.js';

describe('RustMemoryAddon', () => {
  let addon: RustMemoryAddon;

  beforeEach(() => {
    
    addon = new RustMemoryAddon(':memory:');
  });

  afterEach(() => {
    addon.close();
  });

  // 1. Database Indexing & FTS5 Query
  
  describe('SQLite Indexing & FTS5 matching', () => {
    it('should index and retrieve a single chat log entry', async () => {
      const entry = {
        id: 'chat_1',
        session_id: 'session_A',
        role: 'user',
        content: 'Lập trình ứng dụng desktop với Tauri và Rust',
        timestamp: Date.now(),
        symbol_attached: 'tauri.config.json',
      };

      await addon.indexChatMessage(entry);

      const results = await addon.searchFTS5('Tauri');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('chat_1');
      expect(results[0].session_id).toBe('session_A');
      expect(results[0].content).toBe(entry.content);
      expect(results[0].symbol_attached).toBe('tauri.config.json');
    });

    it('should index multiple messages and rank them based on keyword relevance', async () => {
      const logs = [
        {
          id: 'c1',
          session_id: 's1',
          role: 'user',
          content: 'Lập trình nodejs',
          timestamp: Date.now() - 5000,
        },
        {
          id: 'c2',
          session_id: 's1',
          role: 'assistant',
          content: 'Nodejs là run-time của JavaScript cực nhanh',
          timestamp: Date.now() - 4000,
        },
        {
          id: 'c3',
          session_id: 's2',
          role: 'user',
          content: 'Học ReactJS làm giao diện',
          timestamp: Date.now() - 3000,
        },
      ];

      await addon.indexManyMessages(logs);

      // Search for 'nodejs'
      const searchRes = await addon.searchFTS5('nodejs');
      expect(searchRes.length).toBeGreaterThanOrEqual(1);
      expect(searchRes[0].content).toContain('Lập trình nodejs');
    });

    it('should fall back to general LIKE query or token matching if matching syntax fails', async () => {
      const logs = [
        {
          id: 'c1',
          session_id: 's1',
          role: 'user',
          content: 'Viết unit tests với Vitest',
          timestamp: Date.now(),
        },
      ];
      await addon.indexManyMessages(logs);

      const results = await addon.searchFTS5('Vitest');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('c1');
    });
  });

  // 2. Periodical Auto-Vacuum Execution
  
  describe('Auto-Vacuum & Write Counter', () => {
    it('should execute autoVacuum periodically after the configured write interval', async () => {
      // Default interval is now 500 writes (incremental vacuum is cheap but
      // not free) — this test scopes its own addon with a small interval.
      const scoped = new RustMemoryAddon({ dbPath: ':memory:', vacuumIntervalWrites: 5 });
      const originalAutoVacuum = scoped.autoVacuum.bind(scoped);
      let vacuumTriggered = false;
      scoped.autoVacuum = async () => {
        vacuumTriggered = true;
        return originalAutoVacuum();
      };

      for (let i = 1; i <= 6; i++) {
        await scoped.indexChatMessage({
          id: `c_${i}`,
          session_id: 'sess_auto',
          role: 'user',
          content: `Lệnh thứ ${i}`,
          timestamp: Date.now(),
        });
      }

      expect(vacuumTriggered).toBe(true);
    });

    it('does NOT run the old full-file VACUUM (incremental instead)', async () => {
      const execCalls: string[] = [];
      const rawDb = (addon as unknown as { db: { exec(sql: string): void } | null }).db;
      if (rawDb) {
        const originalExec = rawDb.exec.bind(rawDb);
        rawDb.exec = (sql: string) => {
          execCalls.push(sql);
          originalExec(sql);
        };
      }
      await addon.indexChatMessage({
        id: 'c_vac',
        session_id: 'sess_auto',
        role: 'user',
        content: 'vacuum probe',
        timestamp: Date.now(),
      });
      // Force the interval boundary.
      for (let i = 0; i < 500; i++) {
        await addon.indexChatMessage({
          id: `c_vac_${i}`,
          session_id: 'sess_auto',
          role: 'user',
          content: `filler ${i}`,
          timestamp: Date.now(),
        });
      }
      expect(execCalls.some((sql) => /^\s*VACUUM\s*;?\s*$/i.test(sql))).toBe(false);
    });
  });

  // 3. 30-Day Old Log Purger
  
  describe('30-Day Old Log Vacuum', () => {
    it('should purge logs older than 30 days while preserving recent logs', async () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      const logs = [
        {
          id: 'old_1',
          session_id: 's',
          role: 'u',
          content: 'Rất cũ 35 ngày trước',
          timestamp: now - 35 * oneDay,
        },
        {
          id: 'old_2',
          session_id: 's',
          role: 'a',
          content: 'Rất cũ 40 ngày trước',
          timestamp: now - 40 * oneDay,
        },
        {
          id: 'new_1',
          session_id: 's',
          role: 'u',
          content: 'Mới 5 ngày trước',
          timestamp: now - 5 * oneDay,
        },
        { id: 'new_2', session_id: 's', role: 'a', content: 'Vừa xong', timestamp: now },
      ];

      await addon.indexManyMessages(logs);

      const deletedCount = await addon.purgeOldLogs(30);
      expect(deletedCount).toBe(2);

      // Verify that 'new_1' and 'new_2' are still in the database
      const remainingOld1 = await addon.searchFTS5('cũ');
      expect(remainingOld1).toHaveLength(0);

      const remainingNew = await addon.searchFTS5('Mới');
      expect(remainingNew).toHaveLength(1);
      expect(remainingNew[0].id).toBe('new_1');
    });
  });

  // 4. Cosine Similarity (JS Fallback & Rust mock validation)
  
  describe('Cosine Similarity calculations', () => {
    it('should return 1.0 for perfectly identical vectors', () => {
      const v1 = [1.0, 2.0, 3.0, 4.0];
      const v2 = [1.0, 2.0, 3.0, 4.0];

      const sim = addon.cosineSimilarity(v1, v2);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal/independent vectors', () => {
      const v1 = [1.0, 0.0, 0.0];
      const v2 = [0.0, 1.0, 0.0];

      const sim = addon.cosineSimilarity(v1, v2);
      expect(sim).toBe(0.0);
    });

    it('should calculate correct similarity for arbitrary dimensions', () => {
      const v1 = [3.0, 4.0, 0.0]; // Norm is 5.0
      const v2 = [0.0, 3.0, 4.0]; // Norm is 5.0
      // Dot product = 3*0 + 4*3 + 0*4 = 12
      // Sim = 12 / (5 * 5) = 12 / 25 = 0.48

      const sim = addon.cosineSimilarity(v1, v2);
      expect(sim).toBeCloseTo(0.48, 5);
    });

    it('should return 0.0 if any vector norm is zero', () => {
      const v1 = [0.0, 0.0, 0.0];
      const v2 = [1.0, 2.0, 3.0];

      const sim = addon.cosineSimilarity(v1, v2);
      expect(sim).toBe(0.0);
    });
  });

  // 5. RAM Semantic Cache LRU Eviction
  
  describe('RAM Semantic Cache Manager (100MB Cap)', () => {
    it('should store and retrieve vectors from cache correctly', () => {
      const vector = [0.1, 0.2, 0.3, 0.4];
      addon.cacheEmbedding('hello', vector);

      const cached = addon.getEmbeddingFromCache('hello');
      expect(cached).toEqual(vector);
      expect(addon.getCacheSize()).toBe(1);
    });

    it('should evict the Least Recently Used (LRU) entry when size exceeds capacity', () => {
      
      const smallLimit = 1000; // 1000 bytes limit
      (addon as any).MAX_CACHE_SIZE_BYTES = smallLimit;

      // Entry 1 size = 'k1'.length * 2 + 100 * 8 + 64 = 4 + 800 + 64 = 868 bytes.
      const v1 = new Array(100).fill(0.1);
      const v2 = new Array(100).fill(0.2);

      addon.cacheEmbedding('k1', v1);
      expect(addon.getCacheSize()).toBe(1);
      expect(addon.getCacheSizeBytes()).toBe(868);

      addon.cacheEmbedding('k2', v2);

      expect(addon.getCacheSize()).toBe(1); 
      expect(addon.getEmbeddingFromCache('k1')).toBeUndefined(); 
      expect(addon.getEmbeddingFromCache('k2')).toEqual(v2); 
    });

    it('should update timestamp of access to prevent eviction of recently retrieved items', () => {
      const smallLimit = 1000;
      (addon as any).MAX_CACHE_SIZE_BYTES = smallLimit;

      const v = new Array(50).fill(0.5); // size ~ 400 + 64 + 4 = 468 bytes each

      addon.cacheEmbedding('k1', v);
      addon.cacheEmbedding('k2', v);

      expect(addon.getCacheSize()).toBe(2);

      addon.getEmbeddingFromCache('k1');

      addon.cacheEmbedding('k3', v);

      expect(addon.getCacheSize()).toBe(2);
      expect(addon.getEmbeddingFromCache('k2')).toBeUndefined(); 
      expect(addon.getEmbeddingFromCache('k1')).toBeDefined(); 
      expect(addon.getEmbeddingFromCache('k3')).toBeDefined(); 
    });
  });
});
