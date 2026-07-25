// ==============================================================================
// Universal Skill Importer Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  importFromSkillMd,
  importFromJsonManifest,
  parseYamlFrontmatter,
} from '../src/importers/universal-importer.js';

describe('UniversalSkillImporter', () => {
  it('should parse YAML frontmatter and markdown body correctly', () => {
    const rawContent = `---
name: "Test Skill"
description: "A test skill for importing"
category: "terminal"
version: "1.2.0"
dangerous: true
---

# Instructions
Perform test action.
`;

    const { frontmatter, body } = parseYamlFrontmatter(rawContent);

    expect(frontmatter.name).toBe('Test Skill');
    expect(frontmatter.description).toBe('A test skill for importing');
    expect(frontmatter.category).toBe('terminal');
    expect(frontmatter.version).toBe('1.2.0');
    expect(frontmatter.dangerous).toBe(true);
    expect(body).toContain('# Instructions');
  });

  it('should import skill from Anthropic SKILL.md format', async () => {
    const rawContent = `---
name: "Anthropic Skill Example"
description: "Custom Anthropic skill format"
category: "file"
---

Follow these steps to analyze files.
`;

    const result = importFromSkillMd('anthropic-example', rawContent);

    expect(result.format).toBe('anthropic-skill-md');
    expect(result.skill.id).toBe('anthropic-example');
    expect(result.skill.name).toBe('Anthropic Skill Example');
    expect(result.skill.category).toBe('file');

    const execResult = await result.skill.run(
      { input: { path: '/tmp/test.txt' } },
      {} as Record<string, unknown>,
    );
    expect(execResult.success).toBe(true);
    expect(execResult.output).toContain('[Skill Execution: Anthropic Skill Example]');
  });

  it('should import skill from JSON manifest (Cursor / Composio)', async () => {
    const manifest = {
      id: 'cursor-tool-1',
      name: 'Cursor Plugin Tool',
      description: 'A cursor tool manifest',
      category: 'browser',
      version: '2.0.0',
    };

    const result = importFromJsonManifest(manifest);

    expect(result.skill.id).toBe('cursor-tool-1');
    expect(result.skill.name).toBe('Cursor Plugin Tool');
    expect(result.skill.category).toBe('browser');

    const execResult = await result.skill.run({}, {} as Record<string, unknown>);
    expect(execResult.success).toBe(true);
    expect(execResult.output).toContain('Cursor Plugin Tool');
  });
});
