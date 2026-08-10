import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSkills, findSkillMarkdowns, parseDiscoveredSkill } from './discover.js';
import { evaluateDraft, improveDescription, runCreatorLoop } from './creator-loop.js';
import { planExport, skillToMarkdown, exportPlanSummary } from './export-harness.js';
import { SkillSandboxRunner, dockerAvailable } from './sandbox.js';
import { toSkillListView } from './view.js';
import type { SkillDefinition } from '../types.js';

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 's1',
    name: 's1',
    description: 'd',
    category: 'developer',
    version: '1.0.0',
    scopes: [],
    status: 'ready',
    run: async () => ({ success: true }),
    ...overrides,
  };
}

describe('discoverSkills', () => {
  it('discovers skills across layers with shadow rules', () => {
    const root = mkdtempSync(join(tmpdir(), 'discover-'));
    const user = join(root, 'user', 'skills');
    const project = join(root, 'project', '.skills');
    mkdirSync(join(user, 'a'), { recursive: true });
    mkdirSync(join(project, 'a'), { recursive: true });
    mkdirSync(join(project, 'b'), { recursive: true });
    writeFileSync(join(user, 'a', 'SKILL.md'), '---\nname: a\n---\nbody');
    writeFileSync(join(project, 'a', 'SKILL.md'), '---\nname: a\n---\nbody v2');
    writeFileSync(join(project, 'b', 'SKILL.md'), '---\nname: b\n---\nbody');

    const found = discoverSkills({ userDir: user, projectDir: project });
    // 'a' is shadowed by the user layer; 'b' comes from project.
    expect(found.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(found.find((s) => s.id === 'a')?.layer).toBe('user');
    expect(found.find((s) => s.id === 'b')?.layer).toBe('project');
    rmSync(root, { recursive: true, force: true });
  });

  it('findSkillMarkdowns respects depth', () => {
    const root = mkdtempSync(join(tmpdir(), 'depth-'));
    mkdirSync(join(root, 'x', 'y', 'z'), { recursive: true });
    writeFileSync(join(root, 'x', 'SKILL.md'), 'x');
    writeFileSync(join(root, 'x', 'y', 'SKILL.md'), 'y');
    writeFileSync(join(root, 'x', 'y', 'z', 'SKILL.md'), 'z');
    expect(findSkillMarkdowns(root, 2).length).toBe(2);
    expect(findSkillMarkdowns(root, 1).length).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('parseDiscoveredSkill returns null on missing file', () => {
    expect(parseDiscoveredSkill('/nope/SKILL.md', 'user')).toBeNull();
  });
});

describe('creator-loop', () => {
  it('improves description until trigger accuracy is above threshold', async () => {
    const matched = false;
    const draft = {
      id: 't',
      name: 'typo-fixer',
      description: 'Fix typos',
      promptSamples: ['fix this typo', 'spelling error here', 'correct the text'],
    };
    const result = await runCreatorLoop(
      draft,
      {
        threshold: 0.9,
        evaluatePrompt: async (d, prompt) => {
          const m = matched || d.description.includes('Use this skill whenever');
          return { prompt, matched: m, qualityOk: true };
        },
      },
      1,
    );
    expect(result.evaluation.triggerAccuracy).toBeGreaterThan(0.6);
    expect(result.description).toContain('Use this skill whenever');
  });

  it('evaluateDraft reports accuracy and suggestions', async () => {
    const draft = { id: 'a', name: 'x', description: 'short', promptSamples: ['p1', 'p2'] };
    const ev = await evaluateDraft(draft, {
      evaluatePrompt: async (_, p) => ({ prompt: p, matched: p === 'p1', qualityOk: true }),
    });
    expect(ev.triggerAccuracy).toBe(0.5);
    expect(ev.suggestions.length).toBeGreaterThan(0);
  });

  it('improveDescription prepends trigger verbs', () => {
    const out = improveDescription(
      { id: 'a', name: 'grep', description: 'Search files', promptSamples: ['find x', 'search y'] },
      {
        skillId: 'a',
        total: 2,
        matches: 0,
        triggerAccuracy: 0,
        qualityOkRatio: 1,
        suggestions: [],
      },
    );
    expect(out).toContain('Use this skill whenever');
  });
});

describe('export-harness', () => {
  it('plans exports per harness and skips internal skills', () => {
    const skills = [
      makeSkill({ id: 'a', name: 'A', version: '1.0.0', allowedTools: ['file'] }),
      makeSkill({ id: 'b', name: 'B', metadata: { internal: true } }),
    ];
    const plan = planExport(skills, 'claude-code');
    expect(plan.files[0]?.path).toBe('.claude/skills/a/SKILL.md');
    expect(plan.skipped.map((s) => s.id)).toEqual(['b']);
    expect(plan.files[0]?.content).toContain('allowed-tools: file');
  });

  it('serializes a skill back to markdown with v2 fields', () => {
    const md = skillToMarkdown(
      makeSkill({
        id: 'a',
        name: 'A',
        description: 'Do things',
        version: '1.1.0',
        allowedTools: ['file', 'terminal'],
        sandboxPermissions: 'require_escalated',
        license: 'MIT',
        sources: [{ name: 'src', url: 'https://x' }],
      }),
    );
    expect(md).toContain('name: A');
    expect(md).toContain('sandbox_permissions: require_escalated');
    expect(md).toContain('license: MIT');
    expect(md).toContain('url: "https://x"');
    expect(
      exportPlanSummary({ harness: 'codex', files: [{ path: 'x', content: '' }], skipped: [] }),
    ).toContain('codex');
  });
});

describe('sandbox', () => {
  const fakeDocker = (
    args: string[],
  ): { status: number | null; stdout: Buffer; stderr: Buffer } => {
    if (args[0] === 'version')
      return { status: 0, stdout: Buffer.from('24.0'), stderr: Buffer.from('') };
    return { status: 0, stdout: Buffer.from('ran'), stderr: Buffer.from('') };
  };

  it('denies when disabled (deny-default, no host fallback)', () => {
    const runner = new SkillSandboxRunner({ enabled: false, defaultImage: 'img' }, fakeDocker);
    const res = runner.run(['echo', 'hi']);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('disabled');
  });

  it('runs with sandbox labels and limits when enabled', () => {
    let captured: string[] = [];
    const runner = new SkillSandboxRunner(
      { enabled: true, defaultImage: 'img', memory: '256m', cpus: '0.5', networkDisabled: true },
      (args) => {
        captured = args;
        return { status: 0, stdout: Buffer.from('ran'), stderr: Buffer.from('') };
      },
    );
    const res = runner.run(['echo', 'hi']);
    expect(res.ok).toBe(true);
    expect(captured.join(' ')).toContain('--label ghita-sandbox-id=skill');
    expect(captured.join(' ')).toContain('--memory 256m');
    expect(captured.join(' ')).toContain('--network none');
  });

  it('reports docker unavailability', () => {
    const runner = new SkillSandboxRunner({ enabled: true, defaultImage: 'img' }, () => ({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from('docker not found'),
    }));
    const res = runner.run(['ls']);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('docker not available');
  });

  it('dockerAvailable uses the executor', () => {
    expect(dockerAvailable(fakeDocker)).toBe(true);
  });
});

describe('toSkillListView', () => {
  it('renders v2 metadata rows', () => {
    const rows = toSkillListView(
      [
        makeSkill({
          id: 'a',
          name: 'A',
          version: '1.0.0',
          license: 'MIT',
          allowedTools: ['file'],
          sandboxPermissions: 'default',
          enabled: true,
        }),
      ],
      () => ({ locked: true }),
    );
    expect(rows[0]).toMatchObject({
      id: 'a',
      license: 'MIT',
      allowedTools: 'file',
      sandbox: 'default',
      lock: 'locked',
      internal: false,
    });
  });
});
