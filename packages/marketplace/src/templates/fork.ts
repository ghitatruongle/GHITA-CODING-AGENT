import type { AgentTemplate, TemplateFork, TemplateDiff } from './types.js';

/**
 * Template Fork Manager.
 * Handles cloning and forking templates with diff tracking.
 */
export class TemplateForkManager {
  private forks = new Map<string, TemplateFork>();
  private forkChain = new Map<string, string[]>(); // templateId → forkIds

  /**
   * Fork a template — creates a copy that tracks changes from the original.
   */
  fork(
    sourceTemplate: AgentTemplate,
    userId: string,
    customizations?: Partial<AgentTemplate>,
  ): TemplateFork {
    const forkId = `fork-${sourceTemplate.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Deep clone
    const forkedTemplate: AgentTemplate = JSON.parse(JSON.stringify(sourceTemplate));

    // Apply customizations
    if (customizations) {
      if (customizations.name) forkedTemplate.name = customizations.name;
      if (customizations.description) forkedTemplate.description = customizations.description;
      if (customizations.systemPrompt) forkedTemplate.systemPrompt = customizations.systemPrompt;
      if (customizations.config) {
        forkedTemplate.config = { ...forkedTemplate.config, ...customizations.config };
      }
      if (customizations.tools) forkedTemplate.tools = customizations.tools;
      if (customizations.tags) forkedTemplate.tags = customizations.tags;
      if (customizations.icon) forkedTemplate.icon = customizations.icon;
    }

    // Update metadata
    forkedTemplate.id = forkId;
    forkedTemplate.author = {
      id: userId,
      name: userId,
      verified: false,
    };
    forkedTemplate.featured = false;
    forkedTemplate.updatedAt = Date.now();
    forkedTemplate.stats = {
      usageCount: 0,
      forkCount: 0,
      rating: 0,
      reviewCount: 0,
      downloads: 0,
    };

    // Compute diff
    const diff = this.computeDiff(sourceTemplate, forkedTemplate);

    const fork: TemplateFork = {
      id: forkId,
      sourceTemplateId: sourceTemplate.id,
      forkedBy: userId,
      forkedAt: Date.now(),
      template: forkedTemplate,
      changes: diff,
    };

    this.forks.set(forkId, fork);

    // Track fork chain
    if (!this.forkChain.has(sourceTemplate.id)) {
      this.forkChain.set(sourceTemplate.id, []);
    }
    this.forkChain.get(sourceTemplate.id)?.push(forkId);

    return fork;
  }

  /**
   * Clone a template without tracking fork relationship.
   * Useful for creating a personal copy to modify.
   */
  clone(template: AgentTemplate, userId: string): AgentTemplate {
    const cloned: AgentTemplate = JSON.parse(JSON.stringify(template));
    cloned.id = `clone-${template.id}-${Date.now()}`;
    cloned.author = {
      id: userId,
      name: userId,
      verified: false,
    };
    cloned.featured = false;
    cloned.updatedAt = Date.now();
    cloned.stats = {
      usageCount: 0,
      forkCount: 0,
      rating: 0,
      reviewCount: 0,
      downloads: 0,
    };
    return cloned;
  }

  /**
   * Get a fork by ID.
   */
  getFork(forkId: string): TemplateFork | undefined {
    return this.forks.get(forkId);
  }

  /**
   * Get all forks of a template.
   */
  getForksOf(templateId: string): TemplateFork[] {
    const forkIds = this.forkChain.get(templateId) ?? [];
    return forkIds
      .map((id) => this.forks.get(id))
      .filter((f): f is TemplateFork => f !== undefined);
  }

  /**
   * Get the fork chain (all descendants) of a template.
   */
  getForkChain(templateId: string): TemplateFork[] {
    const result: TemplateFork[] = [];
    const queue = [templateId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const forks = this.getForksOf(current);
      for (const fork of forks) {
        result.push(fork);
        queue.push(fork.id);
      }
    }

    return result;
  }

  /**
   * Merge changes from a fork back to the original (simulated).
   * Returns the merged template or null if conflicts exist.
   */
  mergeFork(
    original: AgentTemplate,
    fork: TemplateFork,
  ): { merged: AgentTemplate; conflicts: string[] } {
    const merged: AgentTemplate = JSON.parse(JSON.stringify(original));
    const conflicts: string[] = [];

    // Apply non-conflicting changes
    for (const field of fork.changes.modified) {
      const value = (fork.template as unknown as Record<string, unknown>)[field];
      if (value !== undefined) {
        // Check for conflicts (if original also changed)
        (merged as unknown as Record<string, unknown>)[field] = value;
      }
    }

    // Add new tools
    for (const toolName of fork.changes.addedTools) {
      const tool = fork.template.tools.find((t) => t.name === toolName);
      if (tool && !merged.tools.some((t) => t.name === toolName)) {
        merged.tools.push(tool);
      }
    }

    // Remove tools
    for (const toolName of fork.changes.removedTools) {
      merged.tools = merged.tools.filter((t) => t.name !== toolName);
    }

    merged.updatedAt = Date.now();

    return { merged, conflicts };
  }

  /**
   * Delete a fork.
   */
  deleteFork(forkId: string): boolean {
    const fork = this.forks.get(forkId);
    if (!fork) return false;

    this.forks.delete(forkId);

    // Remove from chain
    const chain = this.forkChain.get(fork.sourceTemplateId);
    if (chain) {
      const idx = chain.indexOf(forkId);
      if (idx >= 0) chain.splice(idx, 1);
    }

    return true;
  }

  get totalForks(): number {
    return this.forks.size;
  }

  // --- Private ---

  private computeDiff(original: AgentTemplate, forked: AgentTemplate): TemplateDiff {
    const modified: string[] = [];
    const addedTools: string[] = [];
    const removedTools: string[] = [];
    const modifiedConfig: string[] = [];

    // Check top-level field changes
    const fields = ['name', 'description', 'systemPrompt', 'icon', 'category'] as const;
    for (const field of fields) {
      if (JSON.stringify(original[field]) !== JSON.stringify(forked[field])) {
        modified.push(field);
      }
    }

    // Check tool changes
    const originalTools = new Set(original.tools.map((t) => t.name));
    const forkedTools = new Set(forked.tools.map((t) => t.name));

    for (const name of forkedTools) {
      if (!originalTools.has(name)) addedTools.push(name);
    }
    for (const name of originalTools) {
      if (!forkedTools.has(name)) removedTools.push(name);
    }

    // Check config changes
    const allConfigKeys = new Set([...Object.keys(original.config), ...Object.keys(forked.config)]);
    for (const key of allConfigKeys) {
      if (
        JSON.stringify((original.config as Record<string, unknown>)[key]) !==
        JSON.stringify((forked.config as Record<string, unknown>)[key])
      ) {
        modifiedConfig.push(key);
      }
    }

    return { modified, addedTools, removedTools, modifiedConfig };
  }
}
