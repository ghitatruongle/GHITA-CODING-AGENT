import { describe, it, expect } from 'vitest';
import {
  importClaudePluginJson,
  importClaudeMarketplaceJson,
  loadClaudePluginFromDir,
} from './claude-plugin.js';
import { parsePluginSpec, installFromLocalDir, PluginInstaller } from './installer.js';
import { createPluginInstallerSkill } from './agent-installer-skill.js';
import { assignTier, TieredCatalog } from './catalog-tiers.js';
import { toMarketplaceView } from './view.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginManifest } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test/plugin',
    name: 'Test Plugin',
    description: 'A test plugin',
    version: '1.0.0',
    author: 'tester',
    category: 'tool',
    tags: [],
    entrypoint: 'src/index.js',
    permissions: [],
    downloads: 0,
    rating: 0,
    ratingCount: 0,
    publishedAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('claude-plugin import', () => {
  it('converts plugin.json to a native manifest', () => {
    const { manifest, warnings } = importClaudePluginJson(
      {
        name: 'code-review',
        version: '0.3.1',
        description: 'Reviews PRs',
        author: 'acme',
        license: 'MIT',
        repository: 'https://github.com/acme/code-review',
        mcp: { server: 'npx mcp-server' },
      },
      'acme/code-review',
    );
    expect(manifest).toBeDefined();
    expect(manifest?.id).toBe('acme/code-review');
    expect(manifest?.license).toBe('MIT');
    expect(manifest?.permissions).toContain('network:http');
    expect(warnings).toHaveLength(0);
  });

  it('returns warnings for invalid plugins', () => {
    const { manifest, warnings } = importClaudePluginJson({}, 'x/y');
    expect(manifest).toBeUndefined();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('parses marketplace.json lists', () => {
    const results = importClaudeMarketplaceJson({
      plugins: [
        { name: 'Docs Helper', source: 'acme/docs-helper', license: 'Apache-2.0' },
        { name: 'Broken', source: '' },
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[0]?.manifest?.id).toBe('docs-helper');
    expect(results[1]?.manifest).toBeUndefined();
  });

  it('loads from a plugin directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugin-dir-'));
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'p', version: '1.0.0', description: 'd', author: 'a' }),
    );
    const { manifest, warnings } = loadClaudePluginFromDir(dir, 'p');
    expect(manifest?.name).toBe('p');
    expect(warnings).toHaveLength(0);
    expect(loadClaudePluginFromDir(join(tmpdir(), 'nope'), 'x').manifest).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('installer', () => {
  it('parses repo specs with refs', () => {
    expect(parsePluginSpec('acme/plugin@v1.2.3')).toEqual({ repo: 'acme/plugin', ref: 'v1.2.3' });
    expect(parsePluginSpec('acme/plugin')).toEqual({ repo: 'acme/plugin', ref: 'main' });
    expect(parsePluginSpec('@scope/plugin@main')).toEqual({ repo: '@scope/plugin', ref: 'main' });
  });

  it('installs from a local dir (offline)', async () => {
    const src = mkdtempSync(join(tmpdir(), 'plugin-src-'));
    const dest = mkdtempSync(join(tmpdir(), 'plugin-dest-'));
    mkdirSync(join(src, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(src, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'p', version: '1.0.0', description: 'd', author: 'a' }),
    );
    const result = await installFromLocalDir(src, 'p', { installDir: dest });
    expect(result.manifest?.id).toBe('p');
    expect(existsSync(join(dest, 'p'))).toBe(true);
    rmSync(src, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  });

  it('uses an injected fetcher for remote specs', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'plugin-dest2-'));
    const installer = new PluginInstaller({
      installDir: dest,
      fetcher: async (spec, temp) => {
        expect(spec.repo).toBe('acme/plugin');
        expect(spec.ref).toBe('v2.0.0');
        mkdirSync(join(temp, '.claude-plugin'), { recursive: true });
        writeFileSync(
          join(temp, '.claude-plugin', 'plugin.json'),
          JSON.stringify({ name: 'p', version: '2.0.0', description: 'd', author: 'a' }),
        );
      },
    });
    const result = await installer.install('acme/plugin@v2.0.0');
    expect(result.manifest?.version).toBe('2.0.0');
    rmSync(dest, { recursive: true, force: true });
  });
});

describe('agent installer skill', () => {
  it('installs and reports', async () => {
    const skill = createPluginInstallerSkill({
      install: async (spec) => {
        if (spec === 'acme/plugin') return { manifest: makeManifest(), warnings: [] };
        return { warnings: ['unknown repo'] };
      },
      listInstalled: () => [{ id: 'test/plugin', name: 'Test Plugin', version: '1.0.0' }],
    });
    const ok = await skill.run({ repo: 'acme/plugin' });
    expect(ok.success).toBe(true);
    expect(ok.output).toContain('Installed Test Plugin@1.0.0');

    const bad = await skill.run({});
    expect(bad.success).toBe(false);
    expect(bad.error).toContain('repo');
  });
});

describe('catalog tiers', () => {
  it('assigns system/curated/experimental and quarantines', () => {
    const catalog = new TieredCatalog({
      isSystem: (m) => m.id.startsWith('@ghita/'),
      curatedBy: (m) => m.id === 'acme/verified',
    });
    catalog.add(makeManifest({ id: '@ghita/core', name: 'Core' }));
    catalog.add(makeManifest({ id: 'acme/verified' }));
    catalog.add(makeManifest({ id: 'acme/random' }));
    expect(catalog.list('system').map((e) => e.manifest.id)).toEqual(['@ghita/core']);
    expect(catalog.list('curated').map((e) => e.manifest.id)).toEqual(['acme/verified']);
    expect(catalog.list('experimental').map((e) => e.manifest.id)).toEqual(['acme/random']);
    catalog.quarantine('acme/random', 'flagged by scan');
    expect(catalog.get('acme/random')?.quarantined).toBe(true);
    expect(catalog.installable().map((e) => e.manifest.id)).toEqual([
      '@ghita/core',
      'acme/verified',
    ]);
    expect(catalog.count()['quarantined']).toBe(1);
  });

  it('assignTier defaults to experimental', () => {
    expect(assignTier(makeManifest())).toBe('experimental');
  });
});

describe('marketplace view', () => {
  it('renders rows with tier, license and versions', () => {
    const rows = toMarketplaceView(
      [makeManifest({ id: 'a/b', version: '1.0.0', license: 'MIT', downloads: 10, rating: 4.5 })],
      {
        versions: new Map([['a/b', ['1.0.0', '0.9.0']]]),
        trust: new Map([['a/b', '✅ verified']]),
      },
    );
    expect(rows[0]?.versions).toEqual(['1.0.0', '0.9.0']);
    expect(rows[0]?.licenseClass).toBe('permissive');
    expect(rows[0]?.trustBadge).toBe('✅ verified');
    expect(rows[0]?.tier).toBe('experimental');
  });
});
