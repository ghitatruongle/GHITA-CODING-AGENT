// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 2: 3-layer discovery (P32)
// ==============================================================================
// Discovers skills from user < workspace < project layers with shadow rules:
// a shallower layer shadows (wins over) deeper layers on the same skill id.
// ==============================================================================

import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { parseYamlFrontmatter } from '../importers/universal-importer.js';
import type { SkillDefinition } from '../types.js';

export type SkillLayer = 'user' | 'workspace' | 'project';

export interface DiscoverOptions {
  userDir?: string;
  workspaceDir?: string;
  projectDir?: string;
  /** Max folder depth to scan inside each layer (default 3, per skill layout). */
  depth?: number;
}

export interface DiscoveredSkill {
  id: string;
  name: string;
  description: string;
  layer: SkillLayer;
  dir: string;
  /** True when the file is under `skills/` or `.skills/` at that layer. */
  standardLayout: boolean;
}

/** Find SKILL.md files at a layer with bounded depth. */
export function findSkillMarkdowns(base: string, maxDepth: number): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist')
          continue;
        walk(full, depth + 1);
      } else if (entry.name === 'SKILL.md') {
        found.push(full);
      }
    }
  };
  walk(base, 0);
  return found;
}

/** Parse one SKILL.md into a DiscoveredSkill. */
export function parseDiscoveredSkill(file: string, layer: SkillLayer): DiscoveredSkill | null {
  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
  const { frontmatter } = parseYamlFrontmatter(content);
  const id =
    (frontmatter.id as string | undefined) ??
    (frontmatter.name as string | undefined) ??
    baseName(file);
  if (!id) return null;
  return {
    id: id.toLowerCase().replace(/\s+/g, '-'),
    name: (frontmatter.name as string) ?? id,
    description: (frontmatter.description as string) ?? '',
    layer,
    dir: dirName(file),
    standardLayout: /[\\/](skills|[.]skills)[\\/]/.test(file.toLowerCase()),
  };
}

/** Discover skills across the three layers with shadow rules. */
export function discoverSkills(options: DiscoverOptions = {}): DiscoveredSkill[] {
  const layers: Array<{ layer: SkillLayer; dir?: string }> = [
    { layer: 'user', dir: options.userDir },
    { layer: 'workspace', dir: options.workspaceDir },
    { layer: 'project', dir: options.projectDir },
  ];
  const depth = options.depth ?? 3;
  const byId = new Map<string, DiscoveredSkill>();

  for (const { layer, dir } of layers) {
    if (!dir || !existsSync(dir)) continue;
    const found = findSkillMarkdowns(dir, depth);
    for (const file of found) {
      const parsed = parseDiscoveredSkill(file, layer);
      if (!parsed) continue;
      const existing = byId.get(parsed.id);
      // Shadow rule: shallower layer wins; same layer keeps first occurrence.
      if (existing && layerOrder(existing.layer) <= layerOrder(parsed.layer)) continue;
      byId.set(parsed.id, parsed);
    }
  }
  return [...byId.values()].sort(
    (a, b) => layerOrder(a.layer) - layerOrder(b.layer) || a.id.localeCompare(b.id),
  );
}

function layerOrder(layer: SkillLayer): number {
  return layer === 'user' ? 0 : layer === 'workspace' ? 1 : 2;
}

function baseName(file: string): string {
  const parts = file.split(/[\\/]/);
  return parts[parts.length - 2] ?? 'skill';
}

function dirName(file: string): string {
  const parts = file.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
}

/** Build SkillDefinition stubs from discovery (status: ready, no executor). */
export function discoveredToSkill(def: DiscoveredSkill): SkillDefinition {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    category: 'developer' as SkillDefinition['category'],
    version: '1.0.0',
    scopes: [],
    status: 'ready',
    enabled: true,
    run: async () => ({
      success: false,
      error: `skill "${def.id}" has no executor (discovered only)`,
    }),
  };
}
