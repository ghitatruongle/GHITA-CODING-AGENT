import { describe, expect, it, beforeEach } from 'vitest';
import {
  ENGINEERING_SKILL_CHAIN,
  createSkillPackSession,
  checkGateSatisfied,
  advanceSession,
} from '../engineering/skill-pack.js';
import {
  SkillUsageTracker,
  lintSkillContent,
  createQuarantinedSkill,
  promoteFromQuarantine,
} from './self-improve.js';
import type { QuarantinedSkill } from './self-improve.js';
import {
  scoreDescription,
  suggestImprovements,
  runDescriptionBenchmark,
} from './description-optimizer.js';
import {
  renderSkillForUse,
  detectTreeShaChange,
  normalizePluginManifest,
  validateMarketplaceManifest,
  lintSkillSubmission,
  ScanCache,
  runCapabilityDoctor,
} from './capability-doctor.js';

// ===========================================================================
// T7.1: Engineering + superpowers skill pack
// ===========================================================================

describe('T7.1: Engineering skill pack', () => {
  it('has all required phases in order', () => {
    const phases = ENGINEERING_SKILL_CHAIN.map((s) => s.phase);
    expect(phases).toContain('brainstorm');
    expect(phases).toContain('plan');
    expect(phases).toContain('implement');
    expect(phases).toContain('verify');
    // brainstorm must come before implement
    const bsIdx = phases.indexOf('brainstorm');
    const implIdx = phases.indexOf('implement');
    expect(bsIdx).toBeLessThan(implIdx);
  });

  it('creates a skill pack session with initial phase', () => {
    const session = createSkillPackSession('Build a REST API');
    expect(session.task).toBe('Build a REST API');
    expect(session.currentPhase).toBe('brainstorm');
    expect(session.completedAt).toBeUndefined();
  });

  it('blocks advancement when gate not satisfied', () => {
    const session = createSkillPackSession('Test task');
    // No artifacts provided — brainstorm gate requires design-doc
    const gate = checkGateSatisfied('brainstorm', session.artifacts);
    expect(gate.satisfied).toBe(false);
  });

  it('advances phase when gate is satisfied', () => {
    const session = createSkillPackSession('Test task');
    // Brainstorm gate requires both design-doc and alternatives-considered
    advanceSession(session, 'design-doc');
    const result = advanceSession(session, 'alternatives-considered');
    // After providing all required artifacts, session should advance to next phase
    expect(result.advanced).toBe(true);
    expect(session.currentPhase).not.toBe('brainstorm');
  });
});

// ===========================================================================
// T7.2: Skill self-improvement
// ===========================================================================

describe('T7.2: Skill self-improvement', () => {
  let tracker: SkillUsageTracker;

  beforeEach(() => {
    tracker = new SkillUsageTracker();
  });

  it('tracks skill usage records', () => {
    tracker.record({ skillId: 'fix-bug', invokedAt: Date.now(), success: true, durationMs: 500 });
    tracker.record({ skillId: 'fix-bug', invokedAt: Date.now(), success: false, durationMs: 300 });

    const stats = tracker.getStats('fix-bug');
    expect(stats).toBeDefined();
    expect(stats!.totalInvocations).toBe(2);
    expect(stats!.successRate).toBe(0.5);
  });

  it('lints skill content for structural issues', () => {
    const goodContent =
      '---\nname: my-skill\ndescription: Does things\n---\n## Usage\nRun this skill.\nExample: test case here.';
    const issues = lintSkillContent(goodContent);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('auto-creates quarantined skill from session', () => {
    const skill = createQuarantinedSkill(
      'session-42',
      'fix-bug-workflow',
      'Automated bug fix workflow',
      '---\nname: fix-bug-workflow\ndescription: Fixes bugs\n---\n## Usage\nRun to fix.',
    );

    expect(skill.tier).toBe('quarantine');
    expect(skill.sourceSessionId).toBe('session-42');
    expect(skill.name).toBe('fix-bug-workflow');
  });

  it('promotes quarantined skill to experimental', () => {
    const skill: QuarantinedSkill = {
      id: 'q-1',
      name: 'test-skill',
      description: 'Test',
      sourceSessionId: 's1',
      createdAt: Date.now(),
      tier: 'quarantine',
      scanPassed: true,
      lintIssues: [],
    };

    const promoted = promoteFromQuarantine(skill);
    expect(promoted.tier).toBe('experimental');
  });
});

// ===========================================================================
// T7.3: Description optimizer + benchmark
// ===========================================================================

describe('T7.3: Description optimizer', () => {
  it('scores a vague description low', () => {
    const result = scoreDescription('does stuff');
    expect(result.score).toBeLessThan(0.5);
    expect(result.penalties.length).toBeGreaterThan(0);
  });

  it('suggests improvements for weak descriptions', () => {
    const suggestions = suggestImprovements('Does things etc');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('runs benchmark on a set of prompts', () => {
    const result = runDescriptionBenchmark('fix-bug', 'Fix bugs in code', [
      { prompt: 'fix the login bug', shouldTrigger: true },
      { prompt: 'repair the crash', shouldTrigger: true },
      { prompt: 'write a poem', shouldTrigger: false },
      { prompt: 'fix bug in module X', shouldTrigger: true },
    ]);

    expect(result.skillId).toBe('fix-bug');
    expect(result.sampleSize).toBe(4);
    expect(result.triggerAccuracy).toBeGreaterThanOrEqual(0);
    expect(result.triggerAccuracy).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// T7.4: Skills use + tree-SHA lock
// ===========================================================================

describe('T7.4: Skills use + tree-SHA', () => {
  it('renders skill prompt with context substitution', () => {
    const result = renderSkillForUse('Hello {{name}}, welcome to {{project}}!', {
      name: 'Alice',
      project: 'GHITA',
    });

    expect(result.renderedPrompt).toContain('Alice');
    expect(result.renderedPrompt).toContain('GHITA');
    expect(result.tempDir).toContain('skill-use');
  });

  it('detects tree-SHA change when files differ', () => {
    const files1 = [{ path: 'a.ts', content: 'original' }];
    const files2 = [{ path: 'a.ts', content: 'modified' }];

    const hash1 = detectTreeShaChange('', files1);
    const hash2 = detectTreeShaChange(hash1.newHash, files2);

    expect(hash2.changed).toBe(true);
  });

  it('reports no change when files are identical', () => {
    const files = [{ path: 'a.ts', content: 'same content' }];
    const first = detectTreeShaChange('', files);
    const second = detectTreeShaChange(first.newHash, files);

    expect(second.changed).toBe(false);
  });
});

// ===========================================================================
// T7.5: Plugin manifest normalization
// ===========================================================================

describe('T7.5: Plugin manifest normalization', () => {
  it('normalizes a raw plugin.json', () => {
    const raw = {
      name: 'code-review-swarm',
      version: '2.0.0',
      description: 'Multi-agent code review',
      commands: [{ name: 'review', description: 'Review PR', entry: './review.js' }],
      hooks: [{ event: 'PreToolUse', command: 'check-policy' }],
    };

    const manifest = normalizePluginManifest(raw);
    expect(manifest.name).toBe('code-review-swarm');
    expect(manifest.version).toBe('2.0.0');
    expect(manifest.commands).toHaveLength(1);
    expect(manifest.hooks).toHaveLength(1);
  });

  it('handles missing optional fields', () => {
    const manifest = normalizePluginManifest({});
    expect(manifest.name).toBe('unnamed-plugin');
    expect(manifest.version).toBe('0.0.0');
    expect(manifest.commands).toHaveLength(0);
  });

  it('validates marketplace manifest', () => {
    const valid = {
      schema: 'marketplace-v1',
      plugins: [{ id: 'p1', name: 'plugin-1', version: '1.0.0', source: 'github' }],
    };
    const result = validateMarketplaceManifest(valid);
    expect(result.valid).toBe(true);

    const invalid = { schema: 'wrong' };
    const badResult = validateMarketplaceManifest(invalid);
    expect(badResult.valid).toBe(false);
  });
});

// ===========================================================================
// T7.6: Marketplace CI lint + cache
// ===========================================================================

describe('T7.6: Marketplace CI lint + cache', () => {
  it('passes lint for well-formed submission', () => {
    const files = [
      { path: 'SKILL.md', content: '---\nname: my-skill\nversion: 1.0.0\n---\n# My Skill' },
      { path: 'index.ts', content: 'export default {};' },
      { path: 'index.test.ts', content: 'describe("test", () => {});' },
      { path: 'README.md', content: '# README' },
    ];

    const result = lintSkillSubmission(files);
    expect(result.passed).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('fails lint when SKILL.md is missing', () => {
    const files = [
      { path: 'index.ts', content: 'export default {};' },
      { path: 'index.test.ts', content: 'describe("test", () => {});' },
    ];

    const result = lintSkillSubmission(files);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.rule === 'skill-md-missing')).toBe(true);
  });

  it('fails lint when tests are missing', () => {
    const files = [
      { path: 'SKILL.md', content: '---\nname: my-skill\n---\n# Skill' },
      { path: 'index.ts', content: 'export default {};' },
    ];

    const result = lintSkillSubmission(files);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.rule === 'test-required')).toBe(true);
  });

  it('ScanCache stores and retrieves by content hash', () => {
    const cache = new ScanCache();
    cache.set('key1', 'hash-abc', { result: 'scanned' });

    const hit = cache.get('key1', 'hash-abc');
    expect(hit).toEqual({ result: 'scanned' });

    const miss = cache.get('key1', 'hash-different');
    expect(miss).toBeNull();
  });
});

// ===========================================================================
// T7.7: Capability doctor
// ===========================================================================

describe('T7.7: Capability doctor', () => {
  it('runs capability checks with ordered backend fallback', async () => {
    const report = await runCapabilityDoctor([
      {
        name: 'search-provider',
        backends: [{ name: 'brave', check: async () => ({ ok: true, latencyMs: 50 }) }],
      },
      {
        name: 'llm-provider',
        backends: [
          { name: 'openai', check: async () => ({ ok: false, error: 'API key missing' }) },
          { name: 'ollama', check: async () => ({ ok: false, error: 'not running' }) },
        ],
      },
    ]);

    expect(report.checks.length).toBe(2);
    expect(report.overallStatus).toBe('degraded');

    const searchCheck = report.checks.find((c) => c.name === 'search-provider');
    expect(searchCheck?.status).toBe('healthy');
    expect(searchCheck?.backend).toBe('brave');

    const llmCheck = report.checks.find((c) => c.name === 'llm-provider');
    expect(llmCheck?.status).toBe('unavailable');
  });

  it('reports healthy when all probes pass', async () => {
    const report = await runCapabilityDoctor([
      {
        name: 'healthy-service',
        backends: [{ name: 'local', check: async () => ({ ok: true, latencyMs: 10 }) }],
      },
    ]);

    expect(report.overallStatus).toBe('healthy');
    expect(report.checks[0]?.status).toBe('healthy');
  });

  it('tries backends in order and uses first success', async () => {
    const report = await runCapabilityDoctor([
      {
        name: 'fallback-service',
        backends: [
          { name: 'primary', check: async () => ({ ok: false, error: 'down' }) },
          { name: 'secondary', check: async () => ({ ok: true, latencyMs: 100 }) },
        ],
      },
    ]);

    expect(report.overallStatus).toBe('healthy');
    expect(report.checks[0]?.backend).toBe('secondary');
  });
});
