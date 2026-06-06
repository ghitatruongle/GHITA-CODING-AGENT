import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SCTIEngine,
  extractErrorCode,
  getJaccardSimilarity,
  compressDiff,
  injectSctiTrajectories,
  createSctiMiddleware,
  createSctiStreamMiddleware,
} from '../../packages/ai-engine/src/middleware/sctiCalibrator.js';
import type { ChatMessage } from '../../packages/ai-engine/src/types.js';

describe('9: SCTI Unit Tests', () => {
  describe('1. Text Helper Algorithms', () => {
    it('should extract error codes correctly', () => {
      expect(extractErrorCode('Error: AST-LOCK-001 occurred')).toBe('AST-LOCK-001');
      expect(extractErrorCode('TS2322: Type number is not assignable to string')).toBe('TS2322');
      expect(extractErrorCode('eslint(curly): Expected { after if')).toBe('eslint(curly)');
      expect(extractErrorCode('Standard text without error codes')).toBeNull();
    });

    it('should compute Jaccard similarity of words correctly', () => {
      const errorA = 'TypeScript Compilation Failed with exit code 1';
      const errorB = 'TypeScript compilation failed, exit status 1';
      const unrelated = 'Docker network bridge created successfully';

      const simSame = getJaccardSimilarity(errorA, errorB);
      const simDiff = getJaccardSimilarity(errorA, unrelated);

      expect(simSame).toBeGreaterThan(0.5);
      expect(simDiff).toBeLessThan(0.1);
    });

    it('should compress diff by removing extra end spacing and blank lines', () => {
      const rawDiff = '  + function test() {   \n\n  - function old() {  \n';
      const expected = '  + function test() {\n  - function old() {';
      expect(compressDiff(rawDiff)).toBe(expected);
    });
  });

  describe('2. SCTIEngine Storage & Retrieval', () => {
    let engine: SCTIEngine;

    beforeEach(() => {
      engine = new SCTIEngine(); // Fallback to in-memory since dbPath is not set
    });

    it('should store corrections and retrieve them by exact error code match', async () => {
      const errorSnippet = 'Error AST-LOCK-001: Symbol calculate modified';
      const diff = '  - return 100;\n  + return 200;';

      await engine.storeCorrection(errorSnippet, diff);
      expect(engine.getCacheSize()).toBe(1);

      const match = await engine.getMatchingTrajectory('Fatal AST-LOCK-001 occurred in class');
      expect(match).not.toBeNull();
      expect(match!.errorCode).toBe('AST-LOCK-001');
      expect(match!.solutionDiff).toBe(compressDiff(diff));
    });

    it('should retrieve corrections by fuzzy Jaccard similarity when exact match fails', async () => {
      const errorSnippet = 'TypeScript Compilation Failed with exit code 1';
      const diff = '  + import fs from "fs";';

      await engine.storeCorrection(errorSnippet, diff, 'COMPILATION_ERROR');

      const match = await engine.getMatchingTrajectory(
        'TypeScript Compilation Failed with exit status 1',
      );
      expect(match).not.toBeNull();
      expect(match!.errorCode).toBe('COMPILATION_ERROR');
    });

    it('should clean corrections older than 30 days', async () => {
      const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
      const recent = new Date().toISOString();

      await engine.storeCorrection('error A', 'diff A');
      await engine.storeCorrection('error B', 'diff B');

      // Manipulate timestamps in cache directly for testing
      const cache = (engine as any).inMemoryCache;
      cache[0].timestamp = thirtyFiveDaysAgo;
      cache[1].timestamp = recent;

      const deletedCount = await engine.cleanObsoleteCorrections();
      expect(engine.getCacheSize()).toBe(1);
      expect((engine as any).inMemoryCache[0].errorSnippet).toBe('error B');
    });
  });

  describe('3. SCTI Prompt Injection Middleware', () => {
    let engine: SCTIEngine;

    beforeEach(async () => {
      engine = new SCTIEngine();
      await engine.storeCorrection(
        'Vitest Failed: 2 tests crashed',
        '  + export function run() {}',
        'VITEST_ERROR',
      );
    });

    it('should inject few-shot into System Message if error logs are found in user chat history', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a coder.' },
        { role: 'user', content: 'Help! Vitest Failed: 2 tests crashed on my machine.' },
      ];

      const updated = await injectSctiTrajectories(messages, engine);

      expect(updated[0]!.content).toContain('[SCTI FEW-SHOT VÁ LỖI TỰ ĐỘNG]');
      expect(updated[0]!.content).toContain('export function run()');
    });

    it('should NOT inject few-shot if no error logs are detected in user message', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a coder.' },
        { role: 'user', content: 'How do I add a new route to NextJS?' },
      ];

      const updated = await injectSctiTrajectories(messages, engine);
      expect(updated[0]!.content).toBe('You are a coder.');
    });

    it('should create functional middlewares for AI gateway', async () => {
      const mw = createSctiMiddleware(engine);
      const streamMw = createSctiStreamMiddleware(engine);

      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a coder.' },
        { role: 'user', content: 'Vitest Failed: 2 tests crashed' },
      ];

      const nextMock = vi.fn().mockResolvedValue({ content: 'Mocked response' });

      await mw({ messages, provider: {} as any }, nextMock);
      expect(nextMock).toHaveBeenCalled();

      const firstArg = nextMock.mock.calls[0]![0]!;
      expect(firstArg[0]!.content).toContain('[SCTI FEW-SHOT VÁ LỖI TỰ ĐỘNG]');
    });
  });
});
