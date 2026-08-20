// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 7.1: Engineering + Superpowers Skill Pack
// ------------------------------------------------------------------------------
// A curated chain of engineering process skills following the superpowers
// methodology: brainstorming HARD-GATE, systematic-debugging 4-phase,
// verification-before-completion, TDD, writing-plans, subagent-driven dev.
// All skills read CONTEXT.md for ubiquitous-language alignment before execution.
//
// Pattern: superpowers + obra engineering skill chain.
// ==============================================================================

export type SkillPackPhase =
  | 'brainstorm'
  | 'plan'
  | 'tdd'
  | 'implement'
  | 'debug'
  | 'verify'
  | 'review';

export interface SkillPackStep {
  phase: SkillPackPhase;
  name: string;
  description: string;
  /** Whether this step is a hard gate (blocks next phase until passed). */
  hardGate: boolean;
  /** Minimum artifacts required to pass this step. */
  requiredArtifacts: string[];
  /** Prompt template for the agent executing this step. */
  promptTemplate: string;
}

export interface SkillPackConfig {
  /** Path to CONTEXT.md for ubiquitous language. */
  contextMdPath?: string;
  /** Whether to enforce hard gates strictly. */
  enforceGates: boolean;
  /** Maximum iterations per phase before escalation. */
  maxIterationsPerPhase: number;
}

export const DEFAULT_SKILL_PACK_CONFIG: SkillPackConfig = {
  contextMdPath: 'CONTEXT.md',
  enforceGates: true,
  maxIterationsPerPhase: 5,
};

/**
 * The engineering skill pack chain definition.
 * Each phase must be completed (or explicitly skipped) before the next begins.
 */
export const ENGINEERING_SKILL_CHAIN: SkillPackStep[] = [
  {
    phase: 'brainstorm',
    name: 'brainstorming-hard-gate',
    description:
      'Explore design space before implementation. HARD-GATE: no code until design is approved.',
    hardGate: true,
    requiredArtifacts: ['design-doc', 'alternatives-considered'],
    promptTemplate:
      'Before writing any code, explore at least 3 alternative approaches for "{{task}}". ' +
      'Document pros/cons of each. Select one with justification. Do NOT implement yet.',
  },
  {
    phase: 'plan',
    name: 'writing-plans',
    description: 'Create a structured implementation plan with milestones.',
    hardGate: false,
    requiredArtifacts: ['implementation-plan'],
    promptTemplate:
      'Based on the approved design, create a step-by-step implementation plan for "{{task}}". ' +
      'Each step should be independently verifiable. Include estimated complexity per step.',
  },
  {
    phase: 'tdd',
    name: 'test-driven-development',
    description: 'Write failing tests before implementation.',
    hardGate: true,
    requiredArtifacts: ['failing-tests'],
    promptTemplate:
      'For each step in the plan, write tests FIRST that define the expected behavior. ' +
      'Tests must fail initially (red phase). Do not write implementation until tests exist.',
  },
  {
    phase: 'implement',
    name: 'subagent-driven-development',
    description: 'Implement changes using focused subagent tasks.',
    hardGate: false,
    requiredArtifacts: ['implementation', 'passing-tests'],
    promptTemplate:
      'Implement "{{step}}" from the plan. Run tests after each change. ' +
      'If tests fail, fix before proceeding to the next step.',
  },
  {
    phase: 'debug',
    name: 'systematic-debugging',
    description: '4-phase debugging: observe → hypothesize → test → fix.',
    hardGate: false,
    requiredArtifacts: ['debug-log'],
    promptTemplate:
      'Systematic debugging for "{{issue}}":\n' +
      '1. OBSERVE: What exactly happens vs what should happen?\n' +
      '2. HYPOTHESIZE: List 3 possible root causes ranked by likelihood.\n' +
      '3. TEST: Design one experiment to confirm/refute the top hypothesis.\n' +
      '4. FIX: Apply minimal fix, verify with tests.',
  },
  {
    phase: 'verify',
    name: 'verification-before-completion',
    description: 'Verify all acceptance criteria before marking complete.',
    hardGate: true,
    requiredArtifacts: ['verification-report'],
    promptTemplate:
      'Before marking "{{task}}" as complete, verify:\n' +
      '- All tests pass\n' +
      '- Acceptance criteria met\n' +
      '- No regressions introduced\n' +
      '- Documentation updated if needed\n' +
      'Produce a verification report with pass/fail for each criterion.',
  },
  {
    phase: 'review',
    name: 'self-review',
    description: 'Review own work before submission.',
    hardGate: false,
    requiredArtifacts: ['review-notes'],
    promptTemplate:
      'Review the changes made for "{{task}}". Check for:\n' +
      '- Code quality and consistency\n' +
      '- Edge cases handled\n' +
      '- Error messages helpful\n' +
      '- No unnecessary complexity',
  },
];

/**
 * Check if a phase's hard gate requirements are satisfied.
 */
export function checkGateSatisfied(
  phase: SkillPackPhase,
  artifacts: string[],
): { satisfied: boolean; missing: string[] } {
  const step = ENGINEERING_SKILL_CHAIN.find((s) => s.phase === phase);
  if (!step || !step.hardGate) return { satisfied: true, missing: [] };

  const missing = step.requiredArtifacts.filter((a) => !artifacts.includes(a));
  return { satisfied: missing.length === 0, missing };
}

/**
 * Get the next phase in the chain, respecting hard gates.
 */
export function getNextPhase(
  currentPhase: SkillPackPhase,
  artifacts: string[],
  enforceGates: boolean,
): SkillPackPhase | null {
  const phases: SkillPackPhase[] = [
    'brainstorm',
    'plan',
    'tdd',
    'implement',
    'debug',
    'verify',
    'review',
  ];
  const idx = phases.indexOf(currentPhase);
  if (idx < 0 || idx >= phases.length - 1) return null;

  if (enforceGates) {
    const gate = checkGateSatisfied(currentPhase, artifacts);
    if (!gate.satisfied) return null; // blocked
  }

  return phases[idx + 1] ?? null;
}

/**
 * Render the prompt for a specific phase with task context.
 */
export function renderPhasePrompt(phase: SkillPackPhase, context: Record<string, string>): string {
  const step = ENGINEERING_SKILL_CHAIN.find((s) => s.phase === phase);
  if (!step) return '';

  let prompt = step.promptTemplate;
  for (const [key, value] of Object.entries(context)) {
    prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return prompt;
}

/**
 * Load CONTEXT.md content for ubiquitous language alignment.
 * Returns empty string if file not found (non-blocking).
 */
export function loadContextMd(content: string | null): string {
  if (!content) return '';
  return content.trim();
}

/**
 * Create a skill pack session tracker.
 */
export interface SkillPackSession {
  id: string;
  task: string;
  currentPhase: SkillPackPhase;
  artifacts: string[];
  iterations: Record<SkillPackPhase, number>;
  startedAt: number;
  completedAt?: number;
}

export function createSkillPackSession(task: string): SkillPackSession {
  return {
    id: `sp-${Date.now().toString(36)}`,
    task,
    currentPhase: 'brainstorm',
    artifacts: [],
    iterations: {
      brainstorm: 0,
      plan: 0,
      tdd: 0,
      implement: 0,
      debug: 0,
      verify: 0,
      review: 0,
    },
    startedAt: Date.now(),
  };
}

export function advanceSession(
  session: SkillPackSession,
  artifact: string,
  config: SkillPackConfig = DEFAULT_SKILL_PACK_CONFIG,
): { advanced: boolean; blocked?: boolean; missing?: string[] } {
  if (!session.artifacts.includes(artifact)) {
    session.artifacts.push(artifact);
  }

  session.iterations[session.currentPhase]++;

  if (session.iterations[session.currentPhase] > config.maxIterationsPerPhase) {
    return { advanced: false, blocked: true };
  }

  const next = getNextPhase(session.currentPhase, session.artifacts, config.enforceGates);
  if (!next) {
    const gate = checkGateSatisfied(session.currentPhase, session.artifacts);
    if (!gate.satisfied) {
      return { advanced: false, blocked: true, missing: gate.missing };
    }
    // Last phase completed
    session.completedAt = Date.now();
    return { advanced: false };
  }

  session.currentPhase = next;
  return { advanced: true };
}
