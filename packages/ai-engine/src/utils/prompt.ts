// ==============================================================================
// GHITA CODING AGENT - Prompt Templates & Prompt Management (STT 2.6, 2.10)
// ==============================================================================

import type { ChatMessage, ChatRole } from '../types.js';

/**
 * Universal template renderer supporting both {{variable}} and {variable} patterns.
 */
export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/(?:\{\{([^{}]+)\}\})|(?:\{([^{}]+)\})/g, (match, p1, p2) => {
    const varName = (p1 || p2 || '').trim();
    if (variables[varName] !== undefined) {
      return String(variables[varName]);
    }
    return match; // Keep unresolved variables
  });
}

// ------------------------------------------------------------------------------
// 2.10 Prompt Templates
// ------------------------------------------------------------------------------

/**
 * Basic String Prompt Template
 */
export class PromptTemplate {
  constructor(
    public readonly template: string,
    public readonly inputVariables?: string[]
  ) {}

  format(variables: Record<string, unknown>): string {
    return renderTemplate(this.template, variables);
  }
}

/**
 * Chat Message Prompt Template
 */
export interface ChatMessageTemplate {
  role: ChatRole;
  template: string;
}

export class ChatPromptTemplate {
  constructor(
    public readonly messages: ChatMessageTemplate[],
    public readonly inputVariables?: string[]
  ) {}

  formatMessages(variables: Record<string, unknown>): ChatMessage[] {
    return this.messages.map((msg) => ({
      role: msg.role,
      content: renderTemplate(msg.template, variables),
    }));
  }
}

/**
 * Few-Shot Prompt Template
 */
export interface FewShotPromptOptions {
  examples: Record<string, unknown>[];
  examplePrompt: PromptTemplate;
  prefix: string;
  suffix: string;
  inputVariables: string[];
  exampleSeparator?: string;
}

export class FewShotPromptTemplate {
  private examples: Record<string, unknown>[];
  private examplePrompt: PromptTemplate;
  private prefix: string;
  private suffix: string;
  private exampleSeparator: string;

  constructor(options: FewShotPromptOptions) {
    this.examples = options.examples;
    this.examplePrompt = options.examplePrompt;
    this.prefix = options.prefix;
    this.suffix = options.suffix;
    this.exampleSeparator = options.exampleSeparator !== undefined ? options.exampleSeparator : '\n\n';
  }

  format(variables: Record<string, unknown>): string {
    const formattedExamples = this.examples
      .map((ex) => this.examplePrompt.format(ex))
      .join(this.exampleSeparator);

    const fullTemplate = `${this.prefix}${this.exampleSeparator}${formattedExamples}${this.exampleSeparator}${this.suffix}`;
    return renderTemplate(fullTemplate, variables);
  }
}

/**
 * Pipeline Prompt Template: composes multiple sub-prompts dynamically
 */
export class PipelinePromptTemplate {
  constructor(
    public readonly finalPrompt: PromptTemplate,
    public readonly pipelinePrompts: Array<{
      parameterName: string;
      prompt: PromptTemplate;
    }>
  ) {}

  format(variables: Record<string, unknown>): string {
    const resolvedVars = { ...variables };
    for (const sub of this.pipelinePrompts) {
      resolvedVars[sub.parameterName] = sub.prompt.format(variables);
    }
    return this.finalPrompt.format(resolvedVars);
  }
}

// ------------------------------------------------------------------------------
// 2.6 Prompt Management (PromptManager)
// ------------------------------------------------------------------------------
export class PromptManager {
  private registry = new Map<string, Map<string, unknown>>();

  register(name: string, template: unknown, version = 'latest'): void {
    if (!this.registry.has(name)) {
      this.registry.set(name, new Map<string, unknown>());
    }
    const versions = this.registry.get(name);
    if (!versions) return;
    versions.set(version, template);

    // If registering for the first time or as 'latest', also save as 'default' or update latest
    if (version !== 'latest') {
      if (!versions.has('latest')) {
        versions.set('latest', template);
      }
    } else {
      // If setting 'latest' specifically, make sure it is stored
      versions.set('latest', template);
    }
  }

  get(name: string, version = 'latest'): unknown {
    const versions = this.registry.get(name);
    if (!versions) {
      throw new Error(`Prompt template "${name}" not found`);
    }

    const template = versions.get(version);
    if (!template) {
      // Fallback to latest if specific version is missing
      const latest = versions.get('latest');
      if (!latest) {
        throw new Error(`Prompt template "${name}" version "${version}" not found`);
      }
      return latest;
    }

    return template;
  }

  delete(name: string, version?: string): void {
    if (version) {
      const versions = this.registry.get(name);
      if (versions) {
        versions.delete(version);
        if (versions.size === 0) {
          this.registry.delete(name);
        }
      }
    } else {
      this.registry.delete(name);
    }
  }

  clear(): void {
    this.registry.clear();
  }
}
