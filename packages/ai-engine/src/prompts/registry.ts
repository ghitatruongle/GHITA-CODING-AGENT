// ==============================================================================
// GHITA CODING AGENT - Prompt Registry & Loader
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { parseYaml } from './yaml-parser.js';
import { validateInput, validateOutput, PromptValidationError } from './validator.js';
import { AISecurityGuardrailError } from '../errors/index.js';
import { renderTemplate } from '../utils/prompt.js';
import type { PromptDefinition } from './types.js';

export class PromptRegistry {
  private prompts = new Map<string, Map<string, PromptDefinition>>();
  private watchers = new Map<string, fs.FSWatcher>();

  /**
   * Register a single prompt definition.
   */
  register(definition: PromptDefinition): void {
    const { name, version } = definition.config;
    if (!this.prompts.has(name)) {
      this.prompts.set(name, new Map<string, PromptDefinition>());
    }
    const versionMap = this.prompts.get(name) as Map<string, PromptDefinition>;
    versionMap.set(version, definition);
  }

  /**
   * Get a prompt definition.
   */
  get(name: string, version: string = 'latest'): PromptDefinition {
    const versionMap = this.prompts.get(name);
    if (!versionMap || versionMap.size === 0) {
      throw new Error(`Prompt "${name}" not found in registry`);
    }

    if (version === 'latest') {
      const versions = Array.from(versionMap.keys());
      // Sort semantic or string versions descending
      versions.sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aP = aParts[i] || 0;
          const bP = bParts[i] || 0;
          if (aP !== bP) return bP - aP;
        }
        return b.localeCompare(a);
      });
      const latestVersion = versions[0];
      if (latestVersion === undefined) {
        throw new Error(`No versions found for prompt "${name}"`);
      }
      return versionMap.get(latestVersion) as PromptDefinition;
    }

    const def = versionMap.get(version);
    if (!def) {
      throw new Error(`Prompt "${name}" version "${version}" not found in registry`);
    }
    return def;
  }

  /**
   * Load prompt from a YAML string.
   */
  loadFromYamlString(yamlContent: string): PromptDefinition {
    interface RawPrompt {
      config?: {
        name?: string;
        version?: string;
        description?: string;
        inputs?: { name: string; type: 'string' | 'number' | 'boolean' | 'array' | 'object'; required: boolean; default?: unknown; description?: string }[];
        provider?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
      };
      template?: string;
      validator?: {
        length?: { min?: number; max?: number };
        format?: { pattern?: string; jsonSchema?: Record<string, unknown> };
        safety?: { blockWords?: string[]; allowWords?: string[]; enablePromptInjectionCheck?: boolean };
      };
    }
    const parsed = parseYaml(yamlContent) as RawPrompt;
    if (!parsed || !parsed.config || !parsed.config.name || !parsed.config.version || !parsed.template) {
      throw new Error('Invalid prompt YAML structure. Must contain config (name, version) and template.');
    }

    const definition: PromptDefinition = {
      config: {
        name: parsed.config.name,
        version: parsed.config.version,
        description: parsed.config.description,
        inputs: parsed.config.inputs || [],
        provider: parsed.config.provider,
        model: parsed.config.model,
        temperature: parsed.config.temperature,
        maxTokens: parsed.config.maxTokens,
      },
      template: parsed.template,
      validator: parsed.validator,
    };

    this.register(definition);
    return definition;
  }

  /**
   * Load a single YAML prompt file.
   */
  loadFromFile(filePath: string): PromptDefinition {
    const content = fs.readFileSync(filePath, 'utf8');
    return this.loadFromYamlString(content);
  }

  /**
   * Load all YAML prompt files in a directory.
   */
  loadDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      return;
    }
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        try {
          this.loadFromFile(path.join(dirPath, file));
        } catch (err: unknown) {
          console.error(`[PromptRegistry] Failed to load prompt file ${file}:`, err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  /**
   * Watch directory for hot-reloads of prompt YAMLs.
   */
  watchDirectory(dirPath: string): void {
    if (this.watchers.has(dirPath)) {
      return;
    }

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const watcher = fs.watch(dirPath, (_eventType, filename) => {
      if (!filename) return;
      if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
        const filePath = path.join(dirPath, filename);
        if (fs.existsSync(filePath)) {
          try {
            this.loadFromFile(filePath);
            console.info(`[PromptRegistry] Hot-reloaded prompt: ${filename}`);
          } catch (err: unknown) {
            console.error(`[PromptRegistry] Hot-reload error for ${filename}:`, err instanceof Error ? err.message : String(err));
          }
        }
      }
    });

    this.watchers.set(dirPath, watcher);
  }

  /**
   * Close all active folder watchers.
   */
  close(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * Compile and render a prompt template with validation.
   */
  render(name: string, version: string | 'latest', variables: Record<string, unknown>): string {
    const def = this.get(name, version);

    // 1. Validate inputs and set defaults
    const validatedVars = validateInput(def.config.inputs, variables);

    // 2. Render templates
    const rendered = renderTemplate(def.template, validatedVars);

    // 3. Validate rendered output
    const validation = validateOutput(def.validator, rendered);
    if (!validation.valid && validation.errors) {
      const isSafetyViolation = validation.errors.some(
        (e) => e.includes('blocked word') || e.includes('injection')
      );
      if (isSafetyViolation) {
        throw new AISecurityGuardrailError(
          'prompt_safety_violation',
          validation.errors,
          validation.errors.join('; ')
        );
      } else {
        throw new PromptValidationError(validation.errors);
      }
    }

    return rendered;
  }
}
