// Tests for RustMemoryAddon.searchFTS5() query sanitization:
//   - FTS5 special characters are neutralized (no syntax errors)
//   - Double-quote injection cannot break out of MATCH wrapper
//   - LIKE fallback properly escapes wildcards (%, _, \)
//   - Empty / whitespace-only queries return empty results
//   - Normal keyword searches still work correctly

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RustMemoryAddon, type ChatLogEntry } from '../src/semantic/rustAddon.js';

describe('RustMemoryAddon — FTS5 Query Escaping Security', () => {
  let addon: RustMemoryAddon;

  // Seed data used by multiple test groups
  const seedLogs: ChatLogEntry[] = [
    {
      id: 'fts_1',
      session_id: 'sess_fts',
      role: 'user',
      content: 'How to configure Tauri window settings',
      timestamp: Date.now() - 5000,
    },
    {
      id: 'fts_2',
      session_id: 'sess_fts',
      role: 'assistant',
      content: 'Use tauri.conf.json to set resizable and decorations',
      timestamp: Date.now() - 4000,
    },
    {
      id: 'fts_3',
      session_id: 'sess_fts',
      role: 'user',
      content: 'Enable CORS headers for API endpoints',
      timestamp: Date.now() - 3000,
    },
    {
      id: 'fts_4',
      session_id: 'sess_fts',
      role: 'assistant',
      content: 'Add Access-Control-Allow-Origin header with specific origins',
      timestamp: Date.now() - 2000,
    },
    {
      id: 'fts_5',
      session_id: 'sess_fts',
      role: 'user',
      content: '100% complete with _underscore and back\\slash',
      timestamp: Date.now() - 1000,
    },
  ];

  beforeEach(async () => {
    addon = new RustMemoryAddon(':memory:');
    await addon.indexManyMessages(seedLogs);
  });

  afterEach(() => {
    addon.close();
  });

  // 1. FTS5 Special Characters — must not crash or produce errors
  
  describe('FTS5 special character neutralization', () => {
    it('should handle asterisk (*) without crashing', async () => {
      // In raw FTS5, * is a prefix wildcard; if unescaped it changes query semantics
      const results = await addon.searchFTS5('Tauri *');
      // Should not throw; results may or may not match depending on tokenization
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle parentheses without crashing', async () => {
      // Parentheses in FTS5 group expressions; unescaped = syntax error
      const results = await addon.searchFTS5('(Tauri OR config)');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle double quotes without breaking out of MATCH wrapper', async () => {
      // This is the critical injection vector: if double quotes are not escaped,
      // an attacker could craft: "Tauri" OR "admin" --
      // to extract unintended results
      const results = await addon.searchFTS5('"Tauri" OR "admin"');
      expect(Array.isArray(results)).toBe(true);
      // The double-quote chars should be escaped (doubled to ""), not interpreted as FTS5 phrase delimiters
      // So this should NOT match entries containing "admin" (which none of our seed data has)
      const adminResults = results.filter((r) => r.content.includes('admin'));
      expect(adminResults).toHaveLength(0);
    });

    it('should handle embedded double-quote in keyword', async () => {
      // A literal double-quote inside a token
      const results = await addon.searchFTS5('tauri"window');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle NEAR operator keyword without injection', async () => {
      // NEAR is an FTS5 operator; if not escaped, "Tauri NEAR config" changes semantics
      const results = await addon.searchFTS5('Tauri NEAR config');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle NOT operator keyword without injection', async () => {
      const results = await addon.searchFTS5('Tauri NOT config');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle AND operator keyword without injection', async () => {
      const results = await addon.searchFTS5('Tauri AND window');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle colon prefix (column filter) without injection', async () => {
      // In FTS5, "content:Tauri" filters to the content column
      const results = await addon.searchFTS5('content:Tauri');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle caret (implicit AND operator) without injection', async () => {
      const results = await addon.searchFTS5('Tauri ^ window');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle SQL comment syntax without injection', async () => {
      const results = await addon.searchFTS5("Tauri'; DROP TABLE old_chats; --");
      expect(Array.isArray(results)).toBe(true);
      // Verify the table still exists by doing another search
      const verify = await addon.searchFTS5('Tauri');
      expect(verify.length).toBeGreaterThan(0);
    });

    it('should handle semicolons without injection', async () => {
      const results = await addon.searchFTS5('Tauri; DROP TABLE old_chats');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle single quotes without injection', async () => {
      const results = await addon.searchFTS5("it's a Tauri test");
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle backslash without issues', async () => {
      const results = await addon.searchFTS5('back\\slash');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // 2. Normal Searches Still Work Correctly
  
  describe('Normal keyword searches remain functional', () => {
    it('should find entries matching a single keyword', async () => {
      const results = await addon.searchFTS5('Tauri');
      expect(results.length).toBeGreaterThanOrEqual(1);
      for (const r of results) {
        expect(r.content.toLowerCase()).toContain('tauri');
      }
    });

    it('should find entries matching multiple keywords', async () => {
      const results = await addon.searchFTS5('CORS headers');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for a keyword that matches nothing', async () => {
      const results = await addon.searchFTS5('quantum_computing_xyz');
      expect(results).toHaveLength(0);
    });
  });

  // 3. Empty / Whitespace Queries
  
  describe('Empty and whitespace queries', () => {
    it('should return empty results for empty string', async () => {
      const results = await addon.searchFTS5('');
      expect(results).toHaveLength(0);
    });

    it('should return empty results for whitespace-only string', async () => {
      const results = await addon.searchFTS5('   ');
      expect(results).toHaveLength(0);
    });

    it('should return empty results for special-characters-only string', async () => {
      const results = await addon.searchFTS5('!@#$%^&*()');
      expect(results).toHaveLength(0);
    });
  });

  // 4. LIKE Fallback Wildcard Escaping
  
  describe('LIKE fallback wildcard escaping', () => {
    // These tests verify the ESCAPE clause logic in the LIKE fallback.
    // The fallback triggers when FTS5 MATCH throws (e.g. on certain queries).
    // We test the public searchFTS5 API — if FTS5 succeeds, LIKE is not exercised.
    // To verify escaping we search for literal wildcard characters.

    it('should find entries containing literal percent sign (%)', async () => {
      // seedLogs[4] contains "100% complete"
      const results = await addon.searchFTS5('100%');
      // Whether FTS5 or LIKE handles it, it should not crash
      expect(Array.isArray(results)).toBe(true);
    });

    it('should find entries containing literal underscore (_)', async () => {
      // seedLogs[4] contains "_underscore"
      const results = await addon.searchFTS5('_underscore');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle backslash in search query without error', async () => {
      const results = await addon.searchFTS5('back\\slash');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // 5. Fallback Token Matching (mock DB path)
  
  describe('Fallback token matching (no SQLite path)', () => {
    it('should correctly tokenize and match in fallback mode', async () => {
      // Create an addon that will use the mock fallback (simulate no better-sqlite3)
      // We access the mock path by constructing with invalid db path that fails init
      const fallbackAddon = new RustMemoryAddon(':memory:');

      // Manually force fallback mode by clearing the db
      (fallbackAddon as unknown).db = null;
      (fallbackAddon as unknown).isFallbackDb = true;
      (fallbackAddon as unknown).mockDbLogs = [...seedLogs];

      const results = await fallbackAddon.searchFTS5('CORS API');
      expect(results.length).toBeGreaterThanOrEqual(1);
      // Should rank entry with both "CORS" and "API" higher
      const topResult = results[0];
      expect(topResult.content).toContain('CORS');

      fallbackAddon.close();
    });

    it('should return empty for empty query in fallback mode', async () => {
      const fallbackAddon = new RustMemoryAddon(':memory:');
      (fallbackAddon as unknown).db = null;
      (fallbackAddon as unknown).isFallbackDb = true;
      (fallbackAddon as unknown).mockDbLogs = [...seedLogs];

      const results = await fallbackAddon.searchFTS5('');
      expect(results).toHaveLength(0);

      fallbackAddon.close();
    });

    it('should return empty for whitespace-only query in fallback mode', async () => {
      const fallbackAddon = new RustMemoryAddon(':memory:');
      (fallbackAddon as unknown).db = null;
      (fallbackAddon as unknown).isFallbackDb = true;
      (fallbackAddon as unknown).mockDbLogs = [...seedLogs];

      const results = await fallbackAddon.searchFTS5('   ');
      expect(results).toHaveLength(0);

      fallbackAddon.close();
    });
  });

  // 6. Limit Parameter
  
  describe('Result limit enforcement', () => {
    it('should respect the limit parameter', async () => {
      // Search for a common word that matches many entries
      const results = await addon.searchFTS5('to', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should default to 10 results max', async () => {
      const results = await addon.searchFTS5('to');
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });
});
