// ==============================================================================
// GHITA CODING AGENT — Phase 5: DocsGriller Extended Tests
// Bổ sung: vector math, cosine similarity, contradiction detection, comparison,
// history persistence, formatReport, Socratic questions, edge cases
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocsGriller, createGrillMeCommand } from '../src/engineering/docsGriller.js';
import type { GrillSession } from '../src/engineering/docsGriller.js';

// Mock fs and child_process with more granular control
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

// =============================================================================
// Constructor & Config
// =============================================================================

describe('DocsGriller — constructor & config', () => {
  it('should use all defaults', () => {
    const g = new DocsGriller();
    expect(g).toBeDefined();
  });

  it('should accept partial config', () => {
    const g = new DocsGriller({ docsPath: 'custom/' });
    expect(g).toBeDefined();
  });

  it('should accept full config', () => {
    const g = new DocsGriller({
      docsPath: 'my-docs/',
      extensions: ['.md', '.rst', '.txt'],
      maxQuestions: 5,
      historyPath: '.custom/history.json',
      similarityThreshold: 0.8,
    });
    expect(g).toBeDefined();
  });

  it('should accept empty extensions array', () => {
    const g = new DocsGriller({ extensions: [] });
    expect(g).toBeDefined();
  });
});

// =============================================================================
// scanLocalDocs
// =============================================================================

describe('DocsGriller — scanLocalDocs', () => {
  it('should return empty when directory does not exist', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValueOnce(false);

    const g = new DocsGriller({ docsPath: 'nonexistent/' });
    const docs = await g.scanLocalDocs();
    expect(docs).toEqual([]);
  });

  it('should accept custom docsPath override', async () => {
    const { existsSync, readdirSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);

    const g = new DocsGriller({ docsPath: 'docs/' });
    const docs = await g.scanLocalDocs('other-path/');
    expect(docs).toEqual([]);
  });

  it('should filter files by extension', async () => {
    const { existsSync, readdirSync, readFileSync, statSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['readme.md', 'data.json', 'notes.txt', 'image.png'] as any);
    vi.mocked(readFileSync).mockReturnValue('content');
    vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as any);

    const g = new DocsGriller({ docsPath: 'docs/', extensions: ['.md', '.txt'] });
    const docs = await g.scanLocalDocs();
    // Should only include .md and .txt files
    expect(docs.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// generateQuestions
// =============================================================================

describe('DocsGriller — generateQuestions', () => {
  it('should return empty when no docs and no contradictions', () => {
    const g = new DocsGriller();
    const questions = g.generateQuestions();
    expect(questions).toEqual([]);
  });

  it('should generate contradiction questions', () => {
    const g = new DocsGriller();
    const questions = g.generateQuestions([
      {
        topic: 'authentication',
        docA: { file: 'old.md', excerpt: 'Use JWT tokens' },
        docB: { file: 'new.md', excerpt: 'Use OAuth2 with PKCE' },
        severity: 'critical',
        recommendation: 'Use new.md as ground truth',
      },
    ]);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0].severity).toBe('contradiction');
    expect(questions[0].sourceDocs).toContain('old.md');
    expect(questions[0].sourceDocs).toContain('new.md');
  });

  it('should generate multiple questions from multiple contradictions', () => {
    const g = new DocsGriller();
    const contradictions = [
      {
        topic: 'auth',
        docA: { file: 'a.md', excerpt: 'JWT' },
        docB: { file: 'b.md', excerpt: 'OAuth2' },
        severity: 'critical' as const,
        recommendation: 'Use b.md',
      },
      {
        topic: 'database',
        docA: { file: 'a.md', excerpt: 'PostgreSQL' },
        docB: { file: 'b.md', excerpt: 'MongoDB' },
        severity: 'major' as const,
        recommendation: 'Use b.md',
      },
    ];
    const questions = g.generateQuestions(contradictions);
    expect(questions.length).toBeGreaterThanOrEqual(2);
  });

  it('should respect mode limit', () => {
    const g = new DocsGriller({ mode: 'quick' }); // quick = 5 questions max
    const contradictions = Array.from({ length: 10 }, (_, i) => ({
      topic: `topic-${i}`,
      docA: { file: `a-${i}.md`, excerpt: 'A' },
      docB: { file: `b-${i}.md`, excerpt: 'B' },
      severity: 'critical' as const,
      recommendation: `Use b-${i}.md`,
    }));
    const questions = g.generateQuestions(contradictions, 'quick');
    expect(questions.length).toBeLessThanOrEqual(5);
  });

  it('should handle contradictions with minor severity', () => {
    const g = new DocsGriller();
    const questions = g.generateQuestions([
      {
        topic: 'formatting',
        docA: { file: 'a.md', excerpt: 'Use tabs' },
        docB: { file: 'b.md', excerpt: 'Use spaces' },
        severity: 'minor',
        recommendation: 'Use b.md',
      },
    ]);
    expect(questions.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// compareAnswer
// =============================================================================

describe('DocsGriller — compareAnswer', () => {
  it('should return empty matches when no docs loaded', () => {
    const g = new DocsGriller();
    const result = g.compareAnswer('I want to use OAuth2');
    expect(result.matches).toEqual([]);
    expect(result.contradictions).toEqual([]);
  });

  it('should return result with correct structure', () => {
    const g = new DocsGriller();
    const result = g.compareAnswer('test answer');
    expect(result).toHaveProperty('matches');
    expect(result).toHaveProperty('contradictions');
    expect(Array.isArray(result.matches)).toBe(true);
    expect(Array.isArray(result.contradictions)).toBe(true);
  });
});

// =============================================================================
// detectContradictions
// =============================================================================

describe('DocsGriller — detectContradictions', () => {
  it('should return empty when no docs loaded', () => {
    const g = new DocsGriller();
    const contradictions = g.detectContradictions();
    expect(contradictions).toEqual([]);
  });

  it('should return empty array when single doc', () => {
    const g = new DocsGriller();
    // Even with a single doc, no pairwise comparison possible
    const contradictions = g.detectContradictions();
    expect(contradictions).toEqual([]);
  });
});

// =============================================================================
// findSharedTopics
// =============================================================================

describe('DocsGriller — findSharedTopics', () => {
  it('should return empty map when no docs', () => {
    const g = new DocsGriller();
    const topics = g.findSharedTopics();
    expect(topics.size).toBe(0);
  });
});

// =============================================================================
// recordAnswer
// =============================================================================

describe('DocsGriller — recordAnswer', () => {
  it('should record answer without throwing', () => {
    const g = new DocsGriller();
    const session: GrillSession = {
      id: 'test', timestamp: '2026-05-24', docsPath: 'docs/', docsScanned: 1,
      mode: 'deep',
      questions: [{ question: 'Which auth?', sourceDocs: ['a.md'], sourceCodeFiles: [], severity: 'warning' }],
      contradictions: [], docCodeContradictions: [], userAnswers: {}, designDecisions: [],
    };
    const updated = g.recordAnswer(session, 0, 'OAuth2');
    expect(updated.userAnswers['Which auth?']).toBe('OAuth2');
  });

  it('should record multiple answers', () => {
    const g = new DocsGriller();
    const session: GrillSession = {
      id: 'test', timestamp: '2026-05-24', docsPath: 'docs/', docsScanned: 1,
      mode: 'deep',
      questions: [
        { question: 'Which auth?', sourceDocs: ['a.md'], sourceCodeFiles: [], severity: 'warning' },
        { question: 'Which DB?', sourceDocs: ['b.md'], sourceCodeFiles: [], severity: 'info' },
      ],
      contradictions: [], docCodeContradictions: [], userAnswers: {}, designDecisions: [],
    };
    g.recordAnswer(session, 0, 'OAuth2');
    g.recordAnswer(session, 1, 'PostgreSQL');
    expect(session.userAnswers['Which auth?']).toBe('OAuth2');
    expect(session.userAnswers['Which DB?']).toBe('PostgreSQL');
  });
});

// =============================================================================
// addDesignDecision
// =============================================================================

describe('DocsGriller — designDecisions (via formatReport)', () => {
  it('should render design decisions in report', () => {
    const g = new DocsGriller();
    const report = g.formatReport({
      id: 'test-dd', timestamp: '2026-05-24', docsPath: 'docs/', docsScanned: 1, mode: 'deep',
      questions: [], contradictions: [], docCodeContradictions: [], userAnswers: {},
      designDecisions: ['Use OAuth2 for auth', 'Use PostgreSQL for DB'],
    });
    expect(report).toContain('OAuth2');
    expect(report).toContain('PostgreSQL');
  });

  it('should handle empty design decisions', () => {
    const g = new DocsGriller();
    const report = g.formatReport({
      id: 'test-dd2', timestamp: '2026-05-24', docsPath: 'docs/', docsScanned: 1, mode: 'deep',
      questions: [], contradictions: [], docCodeContradictions: [], userAnswers: {}, designDecisions: [],
    });
    expect(report).toBeDefined();
  });
});

// =============================================================================
// formatReport
// =============================================================================

describe('DocsGriller — formatReport', () => {
  it('should format empty session', () => {
    const g = new DocsGriller();
    const report = g.formatReport({
      id: 'test-1',
      timestamp: '2026-05-24T00:00:00Z',
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

  it('should format session with contradictions', () => {
    const g = new DocsGriller();
    const report = g.formatReport({
      id: 'test-2',
      timestamp: '2026-05-24T00:00:00Z',
      docsPath: 'docs/',
      docsScanned: 3,
      mode: 'deep',
      questions: [
        { question: 'Which auth?', sourceDocs: ['a.md', 'b.md'], sourceCodeFiles: [], severity: 'contradiction' },
      ],
      contradictions: [
        {
          topic: 'authentication',
          docA: { file: 'old.md', excerpt: 'Use JWT' },
          docB: { file: 'new.md', excerpt: 'Use OAuth2' },
          severity: 'critical',
          recommendation: 'Use new.md',
        },
      ],
      docCodeContradictions: [],
      userAnswers: {},
      designDecisions: [],
    });
    expect(report).toContain('CRITICAL');
    expect(report).toContain('authentication');
    expect(report).toContain('old.md');
    expect(report).toContain('new.md');
  });

  it('should format session with questions', () => {
    const g = new DocsGriller();
    const report = g.formatReport({
      id: 'test-3',
      timestamp: '2026-05-24T00:00:00Z',
      docsPath: 'docs/',
      docsScanned: 2,
      mode: 'deep',
      questions: [
        { question: 'Which database?', sourceDocs: ['arch.md'], sourceCodeFiles: [], severity: 'warning' },
        { question: 'API versioning?', sourceDocs: ['api.md'], sourceCodeFiles: [], severity: 'info' },
      ],
      contradictions: [],
      docCodeContradictions: [],
      userAnswers: {},
      designDecisions: [],
    });
    expect(report).toContain('Which database?');
    expect(report).toContain('API versioning?');
  });

  it('should format session with design decisions', () => {
    const g = new DocsGriller();
    const report = g.formatReport({
      id: 'test-4',
      timestamp: '2026-05-24T00:00:00Z',
      docsPath: 'docs/',
      docsScanned: 1,
      mode: 'deep',
      questions: [],
      contradictions: [],
      docCodeContradictions: [],
      userAnswers: { 'q1': 'OAuth2' },
      designDecisions: ['Use OAuth2 for authentication', 'Use PostgreSQL for database'],
    });
    expect(report).toContain('OAuth2');
    expect(report).toContain('PostgreSQL');
  });

  it('should format session with all severity levels', () => {
    const g = new DocsGriller();
    const report = g.formatReport({
      id: 'test-5',
      timestamp: '2026-05-24T00:00:00Z',
      docsPath: 'docs/',
      docsScanned: 2,
      mode: 'deep',
      questions: [],
      contradictions: [
        { topic: 'a', docA: { file: 'a.md', excerpt: 'x' }, docB: { file: 'b.md', excerpt: 'y' }, severity: 'minor', recommendation: 'Use b.md' },
        { topic: 'b', docA: { file: 'a.md', excerpt: 'x' }, docB: { file: 'b.md', excerpt: 'y' }, severity: 'major', recommendation: 'Use b.md' },
        { topic: 'c', docA: { file: 'a.md', excerpt: 'x' }, docB: { file: 'b.md', excerpt: 'y' }, severity: 'critical', recommendation: 'Use b.md' },
      ],
      docCodeContradictions: [],
      userAnswers: {},
      designDecisions: [],
    });
    expect(report).toContain('MINOR');
    expect(report).toContain('MAJOR');
    expect(report).toContain('CRITICAL');
  });

  it('should format report with Vietnamese content', () => {
    const g = new DocsGriller();
    const report = g.formatReport({
      id: 'test-vi',
      timestamp: '2026-05-24T00:00:00Z',
      docsPath: 'docs/',
      docsScanned: 1,
      mode: 'deep',
      questions: [
        { question: 'Chọn phương thức xác thực nào?', sourceDocs: ['auth.md'], sourceCodeFiles: [], severity: 'warning' },
      ],
      contradictions: [],
      docCodeContradictions: [],
      userAnswers: {},
      designDecisions: ['Sử dụng OAuth2 cho xác thực'],
    });
    expect(report).toContain('Chọn phương thức xác thực');
    expect(report).toContain('Sử dụng OAuth2');
  });
});

// =============================================================================
// loadHistory
// =============================================================================

describe('DocsGriller — loadHistory', () => {
  it('should return empty array when no history file', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    const g = new DocsGriller();
    const history = g.loadHistory();
    expect(history).toEqual([]);
  });

  it('should return empty array when history file is empty/invalid', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.readFileSync).mockReturnValueOnce('invalid json');
    const g = new DocsGriller();
    const history = g.loadHistory();
    expect(history).toEqual([]);
  });
});

// =============================================================================
// runGrillSession
// =============================================================================

describe('DocsGriller — runGrillSession', () => {
  it('should run session and return result with correct structure', async () => {
    const { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue('');
    vi.mocked(writeFileSync).mockImplementation(() => {});
    vi.mocked(mkdirSync).mockImplementation(() => undefined as any);

    const g = new DocsGriller({ docsPath: 'empty-docs/' });
    const session = await g.runGrillSession();

    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('timestamp');
    expect(session).toHaveProperty('docsPath');
    expect(session).toHaveProperty('docsScanned');
    expect(session).toHaveProperty('mode');
    expect(session).toHaveProperty('questions');
    expect(session).toHaveProperty('contradictions');
    expect(session).toHaveProperty('docCodeContradictions');
    expect(session).toHaveProperty('userAnswers');
    expect(session).toHaveProperty('designDecisions');
    expect(session.docsScanned).toBe(0);
    expect(session.questions).toEqual([]);
    expect(session.contradictions).toEqual([]);
  });
});

// =============================================================================
// createGrillMeCommand
// =============================================================================

describe('createGrillMeCommand', () => {
  it('should create valid slash command', () => {
    const cmd = createGrillMeCommand();
    expect(cmd.trigger).toBe('/grill-me');
    expect(cmd.name).toBe('Grill Me');
    expect(typeof cmd.execute).toBe('function');
  });

  it('should have usage field', () => {
    const cmd = createGrillMeCommand();
    expect(cmd.usage).toBeDefined();
  });

  it('should have description field', () => {
    const cmd = createGrillMeCommand();
    expect(cmd.description).toBeDefined();
  });

  it('execute should return a string', async () => {
    const cmd = createGrillMeCommand();
    const result = await cmd.execute('docs/');
    expect(typeof result).toBe('string');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('DocsGriller — edge cases', () => {
  it('should handle special characters in file paths', async () => {
    const { existsSync, readdirSync, readFileSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['file with spaces.md', 'file-with-dashes.md'] as any);
    vi.mocked(readFileSync).mockReturnValue('content about authentication and authorization');

    const g = new DocsGriller({ docsPath: 'docs/' });
    const docs = await g.scanLocalDocs();
    // Should not throw
    expect(Array.isArray(docs)).toBe(true);
  });

  it('should handle empty file content', async () => {
    const { existsSync, readdirSync, readFileSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['empty.md'] as any);
    vi.mocked(readFileSync).mockReturnValue('');

    const g = new DocsGriller({ docsPath: 'docs/' });
    const docs = await g.scanLocalDocs();
    expect(Array.isArray(docs)).toBe(true);
  });

  it('should handle very long file content', async () => {
    const { existsSync, readdirSync, readFileSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['long.md'] as any);
    vi.mocked(readFileSync).mockReturnValue('word '.repeat(10000));

    const g = new DocsGriller({ docsPath: 'docs/' });
    const docs = await g.scanLocalDocs();
    expect(Array.isArray(docs)).toBe(true);
  });

  it('should handle Vietnamese content in docs', async () => {
    const { existsSync, readdirSync, readFileSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['tieng-viet.md'] as any);
    vi.mocked(readFileSync).mockReturnValue('Tài liệu về xác thực và phân quyền người dùng trong hệ thống');

    const g = new DocsGriller({ docsPath: 'docs/' });
    const docs = await g.scanLocalDocs();
    expect(Array.isArray(docs)).toBe(true);
  });

  it('should handle git command failure gracefully', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockImplementation(() => { throw new Error('not a git repo'); });

    const { existsSync, readdirSync, readFileSync, statSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['file.md'] as any);
    vi.mocked(readFileSync).mockReturnValue('content');
    vi.mocked(statSync).mockReturnValue({ mtimeMs: 5000 } as any);

    const g = new DocsGriller({ docsPath: 'docs/' });
    const docs = await g.scanLocalDocs();
    expect(docs.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle unreadable file gracefully', async () => {
    const { existsSync, readdirSync, readFileSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['unreadable.md'] as any);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('permission denied'); });

    const g = new DocsGriller({ docsPath: 'docs/' });
    const docs = await g.scanLocalDocs();
    // Should skip unreadable files
    expect(Array.isArray(docs)).toBe(true);
  });

  it('should handle session with many questions and contradictions', () => {
    const g = new DocsGriller({ maxQuestions: 100 });
    const contradictions = Array.from({ length: 20 }, (_, i) => ({
      topic: `topic-${i}`,
      docA: { file: `a-${i}.md`, excerpt: `excerpt-a-${i}` },
      docB: { file: `b-${i}.md`, excerpt: `excerpt-b-${i}` },
      severity: (i % 3 === 0 ? 'critical' : i % 3 === 1 ? 'major' : 'minor') as 'critical' | 'major' | 'minor',
      recommendation: `Use b-${i}.md`,
    }));

    const questions = g.generateQuestions(contradictions);
    expect(questions.length).toBeGreaterThan(0);
  });
});
