// ==============================================================================
// GHITA CODING AGENT - Skills Package
// ==============================================================================
//
// The Skills package provides the tool/capability layer that agents use to
// interact with the host system and external services.
//
// Key capabilities:
//
// - **Skill Registry**: Type-safe registry for discovering, enabling/disabling,
//   and executing skills at runtime with subscriber notifications.
// - **Built-in Skills (20+)**: File CRUD, directory listing, git operations,
//   terminal command execution, Docker container management, HTTP requests,
//   database queries (SELECT-only for safety), code formatting, linting,
//   testing, search, and deployment automation.
// - **Runtime Adapters**: Pluggable adapters for file I/O, terminal execution,
//   screenshot capture, and application control — allowing skills to work
//   across Tauri desktop, Node.js server, and test environments.
// - **Session-Scoped Forking**: Create isolated registry snapshots per agent
//   session, enabling per-conversation skill configuration.
// - **Security**: Shell argument escaping (`escapeShellArg`, `escapePowerShellString`),
//   SQL injection prevention (SELECT-only queries), and adapter-level sandboxing.
// - **Plugin System**: Third-party skills can be registered via the marketplace
//   with manifest validation, permission declaration, and sandbox hardening.
// - **Composio Integration**: Bridge to Composio's 150+ pre-built tool
//   integrations for SaaS APIs (GitHub, Slack, Jira, etc.).
//
// @packageDocumentation
// @module @ghita/skills
// ==============================================================================

import type { SkillCategory, SkillResult } from '@ghita/shared';

// ── Re-export extracted modules ────────────────────────────────────────────
export type {
  SkillStatus,
  SkillScope,
  SkillInvocation,
  SkillExecutionContext,
  SkillDefinition,
  FileSkillAdapter,
  TerminalSkillAdapter,
  ScreenshotSkillAdapter,
  AppControlSkillAdapter,
  SkillRuntimeAdapters,
  SkillRegistrySnapshot,
} from './types.js';
export { SKILLS_VERSION } from './types.js';

export {
  ok,
  fail,
  readString,
  readNumber,
  readStringArray,
  readBoolean,
  escapeShellArg,
  escapePowerShellString,
  missingAdapter,
} from './helpers.js';

export { createBuiltinSkills } from './builtin-skills.js';

// ── Registry Classes ──────────────────────────────────────────────────────

import type {
  SkillDefinition,
  SkillInvocation,
  SkillRuntimeAdapters,
  SkillRegistrySnapshot,
} from './types.js';
import { createBuiltinSkills } from './builtin-skills.js';

type SkillSubscriber = (snapshot: SkillRegistrySnapshot) => void;

const CATEGORY_ORDER: SkillCategory[] = [
  'file',
  'terminal',
  'browser',
  'computer',
  'screenshot',
  'app',
];

function createEmptyCategoryCount(): Record<SkillCategory, number> {
  return {
    file: 0,
    terminal: 0,
    browser: 0,
    computer: 0,
    screenshot: 0,
    app: 0,
  };
}

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();
  private readonly subscribers = new Set<SkillSubscriber>();

  constructor(private readonly adapters: SkillRuntimeAdapters = {}) {}

  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill already registered: ${skill.id}`);
    }
    this.skills.set(skill.id, skill);
    this.emit();
  }

  registerMany(skills: SkillDefinition[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  unregister(id: string): boolean {
    const removed = this.skills.delete(id);
    if (removed) this.emit();
    return removed;
  }

  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()].sort((a, b) => {
      const categoryDelta = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      return categoryDelta === 0 ? a.name.localeCompare(b.name) : categoryDelta;
    });
  }

  listEnabled(): SkillDefinition[] {
    return this.list().filter((skill) => skill.enabled);
  }

  setEnabled(id: string, enabled: boolean): SkillDefinition {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);

    const updated: SkillDefinition = {
      ...skill,
      enabled,
      status: enabled ? (skill.status === 'disabled' ? 'ready' : skill.status) : 'disabled',
    };

    this.skills.set(id, updated);
    this.emit();
    return updated;
  }

  async run(id: string, invocation: SkillInvocation = {}): Promise<SkillResult> {
    const skill = this.skills.get(id);
    if (!skill) return { success: false, error: `Skill not found: ${id}` };
    if (!skill.enabled) return { success: false, error: `Skill is disabled: ${id}` };

    // Check if skill requires approval (dangerous skills)
    if (skill.dangerous && !invocation.approved) {
      return {
        success: false,
        error: `Skill "${skill.name}" requires user approval. Set invocation.approved = true to proceed.`,
        requiresApproval: true,
        skillId: id,
        skillName: skill.name,
      };
    }

    try {
      const result = await skill.run(invocation, {
        registry: this,
        adapters: this.adapters,
        now: Date.now,
      });
      if (this.adapters.onSkillComplete) {
        await this.adapters.onSkillComplete(id, result);
      }
      return result;
    } catch (error) {
      const errResult: SkillResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      if (this.adapters.onSkillComplete) {
        await this.adapters.onSkillComplete(id, errResult);
      }
      return errResult;
    }
  }

  snapshot(): SkillRegistrySnapshot {
    const byCategory = createEmptyCategoryCount();
    const skills = this.list();
    let enabled = 0;

    for (const skill of skills) {
      byCategory[skill.category] += 1;
      if (skill.enabled) enabled += 1;
    }

    return {
      total: skills.length,
      enabled,
      disabled: skills.length - enabled,
      byCategory,
      skills,
    };
  }

  subscribe(subscriber: SkillSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot());
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private emit(): void {
    if (this.subscribers.size === 0) return;
    const snapshot = this.snapshot();
    for (const subscriber of this.subscribers) {
      subscriber(snapshot);
    }
  }

  fork(sessionId: string): SessionSkillRegistry {
    return new SessionSkillRegistry(this, sessionId);
  }
}

export class SessionSkillRegistry {
  private readonly sessionEnabled = new Map<string, boolean>();

  constructor(
    public readonly parent: SkillRegistry,
    public readonly sessionId: string,
  ) {}

  setEnabled(id: string, enabled: boolean): void {
    this.sessionEnabled.set(id, enabled);
  }

  get(id: string): SkillDefinition | undefined {
    const skill = this.parent.get(id);
    if (!skill) return undefined;
    const isEnabled = this.sessionEnabled.has(id)
      ? Boolean(this.sessionEnabled.get(id))
      : skill.enabled;
    return {
      ...skill,
      enabled: isEnabled,
      status: isEnabled ? (skill.status === 'disabled' ? 'ready' : skill.status) : 'disabled',
    };
  }

  list(): SkillDefinition[] {
    return this.parent.list().map((skill) => {
      const isEnabled = this.sessionEnabled.has(skill.id)
        ? Boolean(this.sessionEnabled.get(skill.id))
        : skill.enabled;
      return {
        ...skill,
        enabled: isEnabled,
        status: isEnabled ? (skill.status === 'disabled' ? 'ready' : skill.status) : 'disabled',
      };
    });
  }

  listEnabled(): SkillDefinition[] {
    return this.list().filter((skill) => skill.enabled);
  }

  async run(id: string, invocation: SkillInvocation = {}): Promise<SkillResult> {
    const skill = this.get(id);
    if (!skill) return { success: false, error: `Skill not found: ${id}` };
    if (!skill.enabled) {
      return { success: false, error: `Skill is disabled in session ${this.sessionId}: ${id}` };
    }
    return this.parent.run(id, invocation);
  }
}

// ── Factory Functions ─────────────────────────────────────────────────────

export function createDefaultSkillRegistry(adapters: SkillRuntimeAdapters = {}): SkillRegistry {
  const registry = new SkillRegistry(adapters);
  registry.registerMany(createBuiltinSkills());
  return registry;
}

export async function runSkillSequence(
  registry: SkillRegistry,
  steps: Array<{ skillId: string; invocation?: SkillInvocation }>,
): Promise<SkillResult[]> {
  const results: SkillResult[] = [];

  for (const step of steps) {
    const result = await registry.run(step.skillId, step.invocation ?? {});
    results.push(result);
    if (!result.success) break;
  }

  return results;
}

// --- Phase 2: Skills Auto-Creation & Hub Registry ---
export * from './auto-create/types.js';
export { SkillAutoCreator } from './auto-create/engine.js';
export { SkillImprover } from './auto-create/improver.js';

// --- Phase 7: Dynamic Skill Generation Loop ---
export { DynamicSkillGenerator, createSkillsSyncCommand } from './registry/dynamicGenerator.js';

// --- Phase 17: Skill Registry & Composio SaaS Integration ---
export { ComposioSkillAdapter } from './registry/composioAdapter.js';
export type {
  SaaSConnection,
  SaaSAPILog,
  SaaSAPIResponse,
  SaaSCategory,
  SaaSAppDefinition,
  WebhookEvent,
  WebhookHandler,
} from './registry/composioAdapter.js';

// --- Phase 2.3: Skill Marketplace (types + catalog only — no Node.js deps) ---
export { getDefaultCatalog } from './marketplace/defaultCatalog.js';
export type {
  SkillManifest,
  InstalledSkill,
  SkillCatalog,
  CatalogFilters,
  SkillRating,
} from './marketplace/types.js';

// --- v0.4.9 A10: Skill pack importer + Community Essentials pack ---
export {
  SkillPackImporter,
  COMMUNITY_ESSENTIALS,
  MIT_COMPATIBLE_LICENSES,
} from './marketplace/skill-pack-importer.js';
export type {
  RawSkillEntry,
  RawSkillPack,
  SkippedSkill,
  SkillPackImportResult,
} from './marketplace/skill-pack-importer.js';

// --- Phase 13: Tool Auto-Repair Gate ---
export {
  ToolRepairGate,
  type RepairLLMProvider,
  type ToolRepairOptions,
} from './registry/repair-gate.js';

// --- Phase 2: SKILL.md Manifest Loader & Hot-Reload Watcher ---
export { loadSkillMd, validateSkill, SkillDirectoryWatcher } from './registry/md-loader.js';

// --- Phase 12: Skills Hub + lock.json ---
export {
  HubRegistry,
  SkillGuard,
  LockManager,
  AuditLog,
  createSkillsCommands,
  computeContentHash,
  computeFileHash,
  computeSkillHash,
  resolveTrustLevel,
  normalizeRepoUrl,
  verifySkillHash,
  verifyFileHash,
  checkIntegrity,
  DEFAULT_TRUSTED_REPOS,
  DEFAULT_HUB_CONFIG,
} from './hub/index.js';

export type {
  SkillMeta,
  SkillSource,
  TrustLevel,
  LockEntry,
  LockFile,
  HubConfig,
  HubStats,
  AuditEntry,
  AuditAction,
  VerifyResult,
  IntegrityReport,
} from './hub/index.js';

// --- Phase 25: OAuth Handoff, Keychain Storage, Permission Gates, and toolkitSlug Discovery ---
export {
  OAuthHandoffManager,
  KeychainStore,
  PermissionGateManager,
  discoverToolkitSlug,
} from './registry/oauth-handoff.js';
export type { OAuthSession } from './registry/oauth-handoff.js';

// --- Universal Skill Importer & AI Governance Security ---
export {
  importFromSkillMd,
  importFromJsonManifest,
  parseYamlFrontmatter,
  type UniversalSkillImportResult,
  type ParsedFrontmatter,
} from './importers/universal-importer.js';

export {
  PolicyEnforcer,
  type CommandEvaluationResult,
  type PromptEvaluationResult,
  type ThreatSeverity,
} from './governance/policy-enforcer.js';

// --- PTY Terminal, AST Editor & OpenClaw Event Triggers (v0.2.5) ---
export { PTYSessionPool, type PTYSession } from './terminal/pty-pool.js';
export { ASTStructuralEditor, type ASTEditChunk } from './engineering/ast-editor.js';
export {
  OpenClawTriggerEngine,
  type EventTrigger,
  type SystemEventType,
} from './openclaw/trigger-engine.js';

// --- Instinct Registry (v0.4.9 A4) ---
export { InstinctRegistry, BUILTIN_INSTINCTS } from './instincts/index.js';
export type {
  Instinct,
  InstinctTriggers,
  InstinctContext,
  FiredInstinct,
} from './instincts/index.js';
