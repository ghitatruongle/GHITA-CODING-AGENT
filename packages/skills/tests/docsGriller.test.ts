// ==============================================================================
// GHITA CODING AGENT — Phase 5: DocsGriller Unit Tests
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocsGriller, createGrillMeCommand } from '../src/engineering/docsGriller.js';

// Mock fs and child_process
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  statSync: vi.fn(() => ({ mtimeMs: Date.now() })),
  mkdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => '1700000000'),
}));

describe('DocsGriller', () => {
  let griller: DocsGriller;

  beforeEach(() => {
    griller = new DocsGriller({ docsPath: 'test-docs/' });
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const g = new DocsGriller();
      expect(g).toBeDefined();
    });

    it('should accept custom config', () => {
      const g = new DocsGriller({
        docsPath: 'custom-docs/',
        extensions: ['.md', '.rst'],
        maxQuestions: 5,
        similarityThreshold: 0.8,
      });
      expect(g).toBeDefined();
    });
  });

  describe('scanLocalDocs', () => {
    it('should return empty array when docs directory not found', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValueOnce(false);

      const g = new DocsGriller({ docsPath: 'nonexistent/' });
      const docs = await g.scanLocalDocs();
      expect(docs).toEqual([]);
    });
  });

  describe('detectContradictions', () => {
    it('should return empty when no docs loaded', () => {
      const contradictions = griller.detectContradictions();
      expect(contradictions).toEqual([]);
    });
  });

  describe('generateQuestions', () => {
    it('should return empty when no docs loaded', () => {
      const questions = griller.generateQuestions();
      expect(questions).toEqual([]);
    });

    it('should generate questions from contradictions', () => {
      const questions = griller.generateQuestions([
        {
          topic: 'auth',
          docA: { file: 'old.md', excerpt: 'Use JWT' },
          docB: { file: 'new.md', excerpt: 'Use OAuth2' },
          severity: 'critical',
          recommendation: 'Use new.md',
        },
      ]);
      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].severity).toBe('contradiction');
    });
  });

  describe('compareAnswer', () => {
    it('should return empty matches when no docs loaded', () => {
      const result = griller.compareAnswer('I want to use OAuth2 for authentication');
      expect(result.matches).toEqual([]);
      expect(result.contradictions).toEqual([]);
    });
  });

  describe('loadHistory', () => {
    it('should return empty array when no history file exists', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      const history = griller.loadHistory();
      expect(history).toEqual([]);
    });
  });

  describe('formatReport', () => {
    it('should format a session with no docs', () => {
      const report = griller.formatReport({
        id: 'test',
        timestamp: '2026-01-01',
        docsPath: 'docs/',
        docsScanned: 0,
        mode: 'deep',
        questions: [],
        contradictions: [],
        docCodeContradictions: [],
        userAnswers: {},
        designDecisions: [],
      });
      expect(report).toContain('No documents found');
    });

    it('should format a session with contradictions', () => {
      const report = griller.formatReport({
        id: 'test',
        timestamp: '2026-01-01',
        docsPath: 'docs/',
        docsScanned: 2,
        mode: 'deep',
        questions: [
          {
            question: 'Which auth method?',
            sourceDocs: ['a.md', 'b.md'],
            sourceCodeFiles: [],
            severity: 'contradiction',
          },
        ],
        contradictions: [
          {
            topic: 'auth',
            docA: { file: 'a.md', excerpt: 'JWT' },
            docB: { file: 'b.md', excerpt: 'OAuth2' },
            severity: 'critical',
            recommendation: 'Use b.md',
          },
        ],
        docCodeContradictions: [],
        userAnswers: {},
        designDecisions: [],
      });
      expect(report).toContain('CRITICAL');
      expect(report).toContain('auth');
    });
  });
});

describe('createGrillMeCommand', () => {
  it('should create a valid slash command', () => {
    const cmd = createGrillMeCommand();
    expect(cmd.trigger).toBe('/grill-me');
    expect(cmd.name).toBe('Grill Me');
    expect(typeof cmd.execute).toBe('function');
  });
});
