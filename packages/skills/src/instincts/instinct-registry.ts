// ==============================================================================
// v0.4.9 A4: Instinct Registry
//
// Instincts are auto-behaviors that suggest a skill to run when the working
// context matches a trigger (file type, error pattern, task type, or keyword).
// Complements the event-driven OpenClawTriggerEngine and the agents-side
// prompt InstinctEngine.
// ==============================================================================

/** What kind of context an instinct reacts to. */
export interface InstinctTriggers {
  /** File extensions without dot, e.g. ['ts', 'tsx']. */
  fileTypes?: string[];
  /** Regex sources matched against an error/log string. */
  errorPatterns?: string[];
  /** Task categories, e.g. ['refactor', 'test', 'release']. */
  taskTypes?: string[];
  /** Free-text keywords matched against the prompt (case-insensitive). */
  keywords?: string[];
}

/** A single auto-behavior. */
export interface Instinct {
  id: string;
  name: string;
  description: string;
  triggers: InstinctTriggers;
  /** Skill to suggest/activate when this instinct fires. */
  suggestedSkillId: string;
  /** Higher wins during conflict resolution. Default 0. */
  priority: number;
  /** Ids of instincts this one supersedes when both fire. */
  conflictsWith?: string[];
  enabled: boolean;
}

/** The current working context evaluated against instincts. */
export interface InstinctContext {
  /** Active file name or path (extension is derived). */
  activeFile?: string;
  /** Recent error/log text to match error patterns against. */
  errorText?: string;
  /** Current task type. */
  taskType?: string;
  /** User prompt / instruction. */
  prompt?: string;
}

/** A fired instinct plus why it matched. */
export interface FiredInstinct {
  instinct: Instinct;
  reasons: string[];
}

/** Built-in instincts tuned for the GHITA monorepo stack. */
export const BUILTIN_INSTINCTS: Instinct[] = [
  {
    id: 'instinct-run-tests-on-src-change',
    name: 'Run tests after source change',
    description: 'When editing a source file, suggest running the package test suite.',
    triggers: { fileTypes: ['ts', 'tsx', 'rs'], taskTypes: ['refactor', 'feature', 'fix'] },
    suggestedSkillId: 'test.run',
    priority: 10,
    enabled: true,
  },
  {
    id: 'instinct-security-scan-on-secret',
    name: 'Security scan on secret-like error',
    description: 'When an error mentions credentials or keys, suggest a security scan.',
    triggers: {
      errorPatterns: ['unauthorized', 'invalid token', 'api key', 'secret'],
      keywords: ['leak', 'exposed', 'credential'],
    },
    suggestedSkillId: 'security.scan',
    priority: 30,
    enabled: true,
  },
  {
    id: 'instinct-diagnose-on-stacktrace',
    name: 'Diagnose on stack trace',
    description: 'When an error contains a stack trace, suggest the debug/diagnose skill.',
    triggers: { errorPatterns: ['\\bat\\s+.+:\\d+:\\d+', 'Traceback', 'panicked at'] },
    suggestedSkillId: 'debug.diagnose',
    priority: 20,
    // Diagnosing takes precedence over blindly re-running tests on a crash.
    conflictsWith: ['instinct-run-tests-on-src-change'],
    enabled: true,
  },
  {
    id: 'instinct-format-on-commit',
    name: 'Format before commit',
    description: 'When the task is a commit/release, suggest formatting first.',
    triggers: { taskTypes: ['commit', 'release'], keywords: ['commit', 'push', 'release'] },
    suggestedSkillId: 'format.run',
    priority: 5,
    enabled: true,
  },
];

/**
 * InstinctRegistry — evaluates context and returns skills to auto-suggest,
 * sorted by priority with conflict resolution.
 *
 * Sử dụng:
 *   const reg = new InstinctRegistry();
 *   const fired = reg.evaluate({ activeFile: 'a.ts', taskType: 'refactor' });
 *   const skillIds = reg.suggestedSkills(fired);
 */
export class InstinctRegistry {
  private readonly instincts = new Map<string, Instinct>();

  constructor(initial: Instinct[] = BUILTIN_INSTINCTS) {
    for (const instinct of initial) this.instincts.set(instinct.id, instinct);
  }

  register(instinct: Instinct): void {
    this.instincts.set(instinct.id, instinct);
  }

  unregister(id: string): boolean {
    return this.instincts.delete(id);
  }

  list(): Instinct[] {
    return [...this.instincts.values()];
  }

  /**
   * Evaluate context; return fired instincts sorted by priority (desc) with
   * conflicting lower-priority instincts removed.
   */
  evaluate(context: InstinctContext): FiredInstinct[] {
    const ext = context.activeFile ? context.activeFile.split('.').pop()?.toLowerCase() : undefined;
    const errorText = (context.errorText ?? '').toLowerCase();
    const promptLower = (context.prompt ?? '').toLowerCase();

    const fired: FiredInstinct[] = [];
    for (const instinct of this.instincts.values()) {
      if (!instinct.enabled) continue;
      const reasons: string[] = [];
      const t = instinct.triggers;

      if (ext && t.fileTypes?.includes(ext)) reasons.push(`file .${ext}`);
      if (context.taskType && t.taskTypes?.includes(context.taskType)) {
        reasons.push(`task ${context.taskType}`);
      }
      if (t.errorPatterns && context.errorText) {
        for (const src of t.errorPatterns) {
          if (safeRegexTest(src, context.errorText)) {
            reasons.push(`error ~ /${src}/`);
            break;
          }
        }
      }
      if (t.keywords) {
        const hay = `${promptLower} ${errorText}`;
        const hit = t.keywords.find((kw) => hay.includes(kw.toLowerCase()));
        if (hit) reasons.push(`keyword ${hit}`);
      }

      if (reasons.length > 0) fired.push({ instinct, reasons });
    }

    return this.resolveConflicts(fired);
  }

  /** Distinct suggested skill ids, in priority order. */
  suggestedSkills(fired: FiredInstinct[]): string[] {
    const out: string[] = [];
    for (const f of fired) {
      if (!out.includes(f.instinct.suggestedSkillId)) out.push(f.instinct.suggestedSkillId);
    }
    return out;
  }

  /** Sort by priority desc, then drop any instinct superseded by a fired one. */
  private resolveConflicts(fired: FiredInstinct[]): FiredInstinct[] {
    const sorted = [...fired].sort((a, b) => b.instinct.priority - a.instinct.priority);
    const suppressed = new Set<string>();
    for (const f of sorted) {
      for (const conflictId of f.instinct.conflictsWith ?? []) {
        suppressed.add(conflictId);
      }
    }
    return sorted.filter((f) => !suppressed.has(f.instinct.id));
  }
}

/** Test a regex source safely; an invalid pattern never throws. */
function safeRegexTest(source: string, value: string): boolean {
  try {
    return new RegExp(source, 'i').test(value);
  } catch {
    return value.toLowerCase().includes(source.toLowerCase());
  }
}
