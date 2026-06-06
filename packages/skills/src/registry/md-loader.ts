// ==============================================================================
// GHITA CODING AGENT - SKILL.md Manifest Loader & Hot-Reload Watcher
// ==============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillDefinition, SkillScope, SkillInvocation } from '../index.js';
import type { SkillCategory, SkillParameter } from '@ghita/shared';

// We import SkillRegistry from '../index.js' later in use to avoid circular issues,
// or we can just type reference it.
interface SkillRegistryLike {
  register(skill: SkillDefinition): void;
  unregister(id: string): boolean;
}

/**
 * Validates a loaded skill definition.
 */
export function validateSkill(skill: Partial<SkillDefinition>): void {
  const errors: string[] = [];

  if (!skill.id || typeof skill.id !== 'string' || skill.id.trim() === '') {
    errors.push('Skill id is required and must be a non-empty string');
  }
  if (!skill.name || typeof skill.name !== 'string' || skill.name.trim() === '') {
    errors.push('Skill name is required and must be a non-empty string');
  }
  if (!skill.description || typeof skill.description !== 'string' || skill.description.trim() === '') {
    errors.push('Skill description is required and must be a non-empty string');
  }

  const validCategories: SkillCategory[] = ['file', 'terminal', 'browser', 'computer', 'screenshot', 'app'];
  if (!skill.category || !validCategories.includes(skill.category)) {
    errors.push(`Skill category must be one of: ${validCategories.join(', ')}. Received: ${skill.category}`);
  }

  if (errors.length > 0) {
    throw new Error(`Skill validation failed for "${skill.id || 'unknown'}":\n- ${errors.join('\n- ')}`);
  }
}

/**
 * Custom line-by-line parser for frontmatter.
 */
function parseFrontmatter(yamlStr: string): Record<string, unknown> {
  const lines = yamlStr.split(/\r?\n/);
  const data: Record<string, unknown> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }
    const key = trimmed.substring(0, colonIdx).trim();
    let val = trimmed.substring(colonIdx + 1).trim();

    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }

    data[key] = val;
  }

  return data;
}

/**
 * Load a single SKILL.md file and return a SkillDefinition.
 */
export function loadSkillMd(filePath: string): SkillDefinition {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n');
  const parts = normalized.split(/^---$/m);

  if (parts.length < 3) {
    throw new Error(`Invalid SKILL.md format in "${filePath}". Missing YAML frontmatter block.`);
  }

  const frontmatterStr = parts[1] || '';
  const markdownBody = parts.slice(2).join('---').trim();

  const frontmatter = parseFrontmatter(frontmatterStr);
  const defaultId = path.basename(path.dirname(filePath)).toLowerCase();

  const id = frontmatter.id || frontmatter.name || defaultId;
  const name = frontmatter.name || defaultId;
  const description = frontmatter.description || '';
  const category = (frontmatter.category || 'computer') as SkillCategory;
  const version = frontmatter.version || '0.1.0';
  const enabled = frontmatter.enabled !== 'false';
  
  // Scopes parse
  let scopes: SkillScope[] = ['workspace', 'system'];
  if (frontmatter.scopes) {
    if (typeof frontmatter.scopes === 'string') {
      scopes = frontmatter.scopes.split(',').map((s: string) => s.trim()) as SkillScope[];
    } else if (Array.isArray(frontmatter.scopes)) {
      scopes = frontmatter.scopes;
    }
  }

  // Construct parameter definitions if specified
  const parameters: Record<string, SkillParameter> = {};
  if (frontmatter.parameters && typeof frontmatter.parameters === 'object') {
    // Basic mapping
    Object.assign(parameters, frontmatter.parameters);
  } else {
    // Add default input parameter
    parameters['input'] = {
      type: 'string',
      description: 'The invocation query or instruction',
      required: false,
    };
  }

  const skill: SkillDefinition = {
    id,
    name,
    description,
    category,
    enabled,
    version,
    scopes,
    status: enabled ? 'ready' : 'disabled',
    parameters,
    // Add instructions field for prompts
    instructions: markdownBody,
    run: async (invocation: SkillInvocation) => {
      return {
        success: true,
        output: `Executed markdown skill "${name}".`,
        data: {
          id,
          name,
          description,
          instructions: markdownBody,
          input: invocation.input,
        },
      };
    },
  } as unknown as SkillDefinition; // Typecast to support custom prompt instructions field

  validateSkill(skill);
  return skill;
}

/**
 * Scan directory recursively for markdown files.
 */
function scanDir(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath, files);
    } else if (item.toLowerCase() === 'skill.md' || item.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Watched directory structure.
 */
export class SkillDirectoryWatcher {
  private watcher: fs.FSWatcher | null = null;
  private filePathToSkillId = new Map<string, string>();

  constructor(
    private readonly dirPath: string,
    private readonly registry: SkillRegistryLike
  ) {}

  /**
   * Scan directory, load/validate all skills, and register them.
   */
  start(): void {
    if (!fs.existsSync(this.dirPath)) {
      fs.mkdirSync(this.dirPath, { recursive: true });
    }

    // Initial load
    const files = scanDir(this.dirPath);
    for (const file of files) {
      this.loadFile(file);
    }

    // Start watching
    this.watcher = fs.watch(this.dirPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      
      const fullPath = path.join(this.dirPath, filename);
      const isMd = filename.toLowerCase() === 'skill.md' || filename.endsWith('.md');
      if (!isMd) return;

      // Wrap in small timeout to ensure write completion
      setTimeout(() => {
        if (fs.existsSync(fullPath)) {
          // File created or modified
          this.loadFile(fullPath);
        } else {
          // File deleted
          this.unloadFile(fullPath);
        }
      }, 50);
    });
  }

  /**
   * Load file, overwrite if already registered.
   */
  private loadFile(filePath: string): void {
    try {
      const skill = loadSkillMd(filePath);
      
      // If already registered, unregister first (avoid duplicate errors)
      if (this.filePathToSkillId.has(filePath)) {
        const oldId = this.filePathToSkillId.get(filePath);
        if (oldId) {
          this.registry.unregister(oldId);
        }
      }
      this.registry.unregister(skill.id); // also unregister by id directly in case path mismatch

      this.registry.register(skill);
      this.filePathToSkillId.set(filePath, skill.id);
      console.info(`[SkillWatcher] Loaded/reloaded skill: ${skill.id} from ${path.basename(filePath)}`);
    } catch (err: unknown) {
      console.error(`[SkillWatcher] Error loading file ${filePath}:`, err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Unload file.
   */
  private unloadFile(filePath: string): void {
    const skillId = this.filePathToSkillId.get(filePath);
    if (skillId) {
      this.registry.unregister(skillId);
      this.filePathToSkillId.delete(filePath);
      console.info(`[SkillWatcher] Unloaded skill: ${skillId}`);
    }
  }

  /**
   * Close the directory watcher.
   */
  close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
