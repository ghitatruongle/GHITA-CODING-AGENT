// Converts external skill definitions (Anthropic SKILL.md, OpenClaw, Superpowers,
// Cursor Plugins, Composio tools) into native GHITA SkillDefinitions.

import type { SkillCategory, SkillResult } from '@ghita/shared';
import type {
  SkillDefinition,
  SkillInvocation,
  SkillExecutionContext,
  SkillScope,
} from '../types.js';

export interface ParsedFrontmatter {
  name?: string;
  description?: string;
  category?: SkillCategory;
  version?: string;
  scopes?: SkillScope[];
  dangerous?: boolean;
  parameters?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'array';
      description: string;
      required: boolean;
      default?: unknown;
    }
  >;
  [key: string]: unknown;
}

export interface UniversalSkillImportResult {
  skill: SkillDefinition;
  body: string;
  rawFrontmatter: ParsedFrontmatter;
  format: 'anthropic-skill-md' | 'cursor-plugin' | 'composio-json' | 'generic-markdown';
}

/**
 * Utility to parse YAML frontmatter block surrounded by `---` delimiters.
 */

export function parseYamlFrontmatter(content: string): {
  frontmatter: ParsedFrontmatter;
  body: string;
} {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) {
    return { frontmatter: {}, body: content };
  }

  const endMatchIndex = trimmed.indexOf('\n---', 3);
  if (endMatchIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = trimmed.slice(3, endMatchIndex).trim();
  const body = trimmed.slice(endMatchIndex + 4).trim();
  const frontmatter: ParsedFrontmatter = {};

  const lines = frontmatterStr.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      let value: unknown = line.slice(colonIdx + 1).trim();

      // Basic string unquoting
      if (typeof value === 'string' && (value.startsWith('"') || value.startsWith("'"))) {
        value = value.slice(1, -1);
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (!isNaN(Number(value)) && value !== '') {
        value = Number(value);
      }

      if (key) {
        frontmatter[key] = value;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Import a skill from SKILL.md format (Anthropic, OpenClaw, Superpowers compatible).
 */
export function importFromSkillMd(
  id: string,
  content: string,
  overrides?: Partial<SkillDefinition>,
): UniversalSkillImportResult {
  const { frontmatter, body } = parseYamlFrontmatter(content);

  const name =
    frontmatter.name || id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const description =
    frontmatter.description ||
    body.slice(0, 150).replace(/\n/g, ' ') ||
    `Skill imported from SKILL.md: ${name}`;
  const category: SkillCategory =
    frontmatter.category &&
    ['file', 'terminal', 'browser', 'computer', 'screenshot', 'app'].includes(frontmatter.category)
      ? frontmatter.category
      : 'file';

  const skill: SkillDefinition = {
    id,
    name,
    description,
    category,
    enabled: true,
    version: frontmatter.version || '1.0.0',
    scopes: (frontmatter.scopes as SkillScope[]) || ['workspace'],
    status: 'ready',
    dangerous: Boolean(frontmatter.dangerous),
    parameters: frontmatter.parameters,
    run: async (
      invocation: SkillInvocation,
      _context: SkillExecutionContext,
    ): Promise<SkillResult> => {
      // Return skill instructions along with invocation parameters
      return {
        success: true,
        output: `[Skill Execution: ${name}]\n\n${body}\n\n[Inputs]: ${JSON.stringify(invocation.input || {})}`,
        data: {
          skillId: id,
          instructionBody: body,
          input: invocation.input,
        },
      };
    },
    ...overrides,
  };

  return {
    skill,
    body,
    rawFrontmatter: frontmatter,
    format: 'anthropic-skill-md',
  };
}

/**
 * Import a skill from a JSON manifest (Cursor Plugins, Composio tools, Vercel skills).
 */
export function importFromJsonManifest(
  jsonManifest: Record<string, unknown>,
  overrides?: Partial<SkillDefinition>,
): UniversalSkillImportResult {
  const id = String(jsonManifest.id || jsonManifest.name || 'imported-json-skill')
    .toLowerCase()
    .replace(/\s+/g, '-');
  const name = String(jsonManifest.name || jsonManifest.title || id);
  const description = String(jsonManifest.description || `Imported JSON skill ${name}`);
  const categoryStr = String(jsonManifest.category || 'terminal');
  const category: SkillCategory = [
    'file',
    'terminal',
    'browser',
    'computer',
    'screenshot',
    'app',
  ].includes(categoryStr)
    ? (categoryStr as SkillCategory)
    : 'terminal';

  const skill: SkillDefinition = {
    id,
    name,
    description,
    category,
    enabled: true,
    version: String(jsonManifest.version || '1.0.0'),
    scopes: ['workspace'],
    status: 'ready',
    dangerous: Boolean(jsonManifest.dangerous || jsonManifest.requiresApproval),
    run: async (invocation: SkillInvocation): Promise<SkillResult> => {
      return {
        success: true,
        output: `[JSON Skill: ${name}]\n${description}\nInputs: ${JSON.stringify(invocation.input || {})}`,
        data: jsonManifest,
      };
    },
    ...overrides,
  };

  return {
    skill,
    body: description,
    rawFrontmatter: jsonManifest as ParsedFrontmatter,
    format: jsonManifest.composio ? 'composio-json' : 'cursor-plugin',
  };
}
