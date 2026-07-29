// ==============================================================================
// v0.4.9 A10: SkillPackImporter Unit Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  SkillPackImporter,
  COMMUNITY_ESSENTIALS,
  type RawSkillPack,
} from '../src/marketplace/skill-pack-importer.js';

describe('SkillPackImporter', () => {
  it('imports the curated Community Essentials pack', () => {
    const result = new SkillPackImporter().importPack(COMMUNITY_ESSENTIALS);
    expect(result.packName).toBe('Community Essentials');
    expect(result.imported.length).toBe(COMMUNITY_ESSENTIALS.entries.length);
    expect(result.skipped).toHaveLength(0);
    const ids = result.imported.map((s) => s.id);
    expect(ids).toContain('docs-writer');
    expect(ids).toContain('review-pr');
    // frontmatter name parsed
    expect(result.imported.find((s) => s.id === 'docs-writer')!.name).toBe('Docs Writer');
  });

  it('skips entries with an incompatible license', () => {
    const pack: RawSkillPack = {
      name: 'Mixed',
      entries: [
        { id: 'ok', content: '---\nname: Ok\n---\nbody', license: 'MIT' },
        { id: 'gpl', content: '---\nname: Gpl\n---\nbody', license: 'GPL-3.0' },
        { id: 'none', content: '---\nname: None\n---\nbody' },
      ],
    };
    const result = new SkillPackImporter().importPack(pack);
    expect(result.imported.map((s) => s.id)).toEqual(['ok']);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((s) => s.reason === 'incompatible-license')).toBe(true);
  });

  it('inherits the pack-level license when an entry omits its own', () => {
    const pack: RawSkillPack = {
      name: 'PackLicensed',
      license: 'Apache-2.0',
      entries: [{ id: 'a', content: '---\nname: A\n---\nbody' }],
    };
    const result = new SkillPackImporter().importPack(pack);
    expect(result.imported).toHaveLength(1);
  });

  it('flags duplicate ids', () => {
    const pack: RawSkillPack = {
      name: 'Dupes',
      license: 'MIT',
      entries: [
        { id: 'dup', content: '---\nname: One\n---\nbody' },
        { id: 'dup', content: '---\nname: Two\n---\nbody' },
      ],
    };
    const result = new SkillPackImporter().importPack(pack);
    expect(result.imported).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('duplicate-id');
  });

  it('treats license matching as case-insensitive', () => {
    const pack: RawSkillPack = {
      name: 'CaseTest',
      entries: [{ id: 'x', content: '---\nname: X\n---\nbody', license: 'mit' }],
    };
    const result = new SkillPackImporter().importPack(pack);
    expect(result.imported).toHaveLength(1);
  });
});
