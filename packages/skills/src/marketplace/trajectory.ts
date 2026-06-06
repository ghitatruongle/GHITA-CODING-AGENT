// ==============================================================================
// GHITA CODING AGENT - Trajectory-to-Skill
// Phase 9 (Update 0.0.3 beta2): Skill auto-create from agent trajectories
// ==============================================================================

import type { SkillManifest } from './types.js';

// ----------------------------------------------------------------------------
// Trajectory types
// ----------------------------------------------------------------------------

export interface TrajectoryStep {
  /** Human-readable action name, e.g. "navigate", "click", "extract". */
  action: string;
  /** Free-form input passed to the action. */
  input: Record<string, unknown>;
  /** Free-form output produced by the action. */
  output?: unknown;
  /** Step timestamp in epoch ms. */
  timestamp: number;
  /** Whether the step succeeded. */
  success: boolean;
  /** Optional duration in ms. */
  durationMs?: number;
}

export interface AgentTrajectory {
  /** Unique id of the trajectory (often the session id). */
  id: string;
  /** Goal that produced this trajectory, e.g. user prompt or task title. */
  goal: string;
  /** Optional list of skills the trajectory ended up using. */
  usedSkills: string[];
  /** Ordered list of steps. */
  steps: TrajectoryStep[];
  /** Free-form tags/labels. */
  tags: string[];
  /** When the trajectory was recorded. */
  recordedAt: number;
}

export interface TrajectoryPattern {
  /** First step in the pattern, used as anchor for matching. */
  anchor: string;
  /** Sequence of action names after the anchor. */
  sequence: string[];
  /** How many trajectories used this pattern. */
  frequency: number;
}

export interface ExtractedSkill {
  /** Suggested skill id, reverse-DNS style. */
  suggestedId: string;
  name: string;
  description: string;
  /** Generated from the most common input keys in the pattern. */
  inputSchema: Record<string, string>;
  /** Reference to a representative trajectory for the pattern. */
  exampleTrajectoryId: string;
  /** Frequency weight used to rank suggestions. */
  frequency: number;
}

// ----------------------------------------------------------------------------
// Pattern detection
// ----------------------------------------------------------------------------

const MIN_PATTERN_LENGTH = 2;
const MIN_FREQUENCY = 2;

function actionsOf(t: AgentTrajectory): string[] {
  return t.steps.map((s) => s.action);
}

function patternKey(actions: string[]): string {
  return actions.join('->');
}

/**
 * Group trajectories that share the same action sequence (after the first
 * step). The returned patterns are sorted by descending frequency.
 */
export function detectPatterns(trajectories: AgentTrajectory[]): TrajectoryPattern[] {
  const buckets = new Map<string, AgentTrajectory[]>();
  for (const t of trajectories) {
    const actions = actionsOf(t);
    if (actions.length < MIN_PATTERN_LENGTH) continue;
    const seq = actions.slice(1);
    const key = patternKey(seq);
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }

  const patterns: TrajectoryPattern[] = [];
  for (const [, list] of buckets) {
    if (list.length < MIN_FREQUENCY) continue;
    const first = list[0];
    if (!first) continue;
    const seq = actionsOf(first).slice(1);
    if (seq.length === 0) continue;
    patterns.push({
      anchor: first.steps[0]?.action ?? 'start',
      sequence: seq,
      frequency: list.length,
    });
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

// ----------------------------------------------------------------------------
// Skill extraction
// ----------------------------------------------------------------------------

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function inferTypeFromValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function inferInputSchema(steps: TrajectoryStep[]): Record<string, string> {
  const schema: Record<string, string> = {};
  for (const step of steps) {
    for (const [key, value] of Object.entries(step.input)) {
      if (!(key in schema)) schema[key] = inferTypeFromValue(value);
    }
  }
  return schema;
}

function pickExample(trajectories: AgentTrajectory[]): AgentTrajectory | null {
  return trajectories[0] ?? null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function summarize(actions: string[]): string {
  if (actions.length === 0) return 'Generic workflow';
  if (actions.length === 1) return `${actions[0]} workflow`;
  return `${actions[0]} → ${actions.slice(1, 4).join(' → ')}`;
}

function toSuggestedId(trajectories: AgentTrajectory[], pattern: TrajectoryPattern): string {
  const goal = trajectories.find((t) => t.goal)?.goal ?? pattern.anchor;
  const slug = slugify(`${pattern.anchor}-${goal}`);
  return `auto.${slug || 'workflow'}`;
}

/**
 * Convert detected patterns into draft SkillManifests that the user can
 * promote into the registry. The manifests are NOT registered automatically;
 * they are returned for the UI to present as suggestions.
 */
export function extractSkillFromPattern(
  pattern: TrajectoryPattern,
  trajectories: AgentTrajectory[],
  options: { author?: string } = {},
): { draft: SkillManifest; extraction: ExtractedSkill } | null {
  const bucket = trajectories.filter((t) => {
    const seq = actionsOf(t).slice(1);
    return patternKey(seq) === patternKey(pattern.sequence);
  });
  if (bucket.length === 0) return null;

  const example = pickExample(bucket);
  if (!example) return null;

  const anchorStep = example.steps[0];
  const restSteps = example.steps.slice(1);
  const allSteps = anchorStep ? [anchorStep, ...restSteps] : restSteps;
  const inputSchema = inferInputSchema(allSteps);

  const author = options.author ?? 'GHITA Auto-Miner';
  const name = summarize(pattern.sequence);
  const description =
    `Auto-generated skill that performs: ${pattern.sequence.join(' \u2192 ')}. ` +
    `Observed ${pattern.frequency} times across trajectories.`;
  const suggestedId = toSuggestedId(bucket, pattern);
  const now = Date.now();

  const draft: SkillManifest = {
    id: suggestedId,
    name,
    description,
    version: '0.1.0',
    author,
    category: 'app',
    tags: unique(['auto-generated', ...example.tags, ...pattern.anchor.split(/\s+/)]).slice(0, 8),
    permissions: ['network'],
    dependencies: {},
    downloads: 0,
    rating: 0,
    ratingCount: 0,
    publishedAt: now,
    updatedAt: now,
  };

  const extraction: ExtractedSkill = {
    suggestedId,
    name,
    description,
    inputSchema,
    exampleTrajectoryId: example.id,
    frequency: pattern.frequency,
  };

  return { draft, extraction };
}

export function extractSkills(
  trajectories: AgentTrajectory[],
  options: { author?: string } = {},
): ExtractedSkill[] {
  const patterns = detectPatterns(trajectories);
  const byKey = new Map<string, AgentTrajectory[]>();
  for (const t of trajectories) {
    const seq = actionsOf(t).slice(1);
    const key = patternKey(seq);
    const list = byKey.get(key) ?? [];
    list.push(t);
    byKey.set(key, list);
  }
  const out: ExtractedSkill[] = [];
  for (const pattern of patterns) {
    const bucket = byKey.get(patternKey(pattern.sequence)) ?? [];
    const result = extractSkillFromPattern(pattern, bucket, options);
    if (result) out.push(result.extraction);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Trajectory store (in-memory, used by tests and the auto-mine UI)
// ----------------------------------------------------------------------------

export class TrajectoryStore {
  private byId = new Map<string, AgentTrajectory>();

  add(t: AgentTrajectory): void {
    this.byId.set(t.id, t);
  }

  remove(id: string): boolean {
    return this.byId.delete(id);
  }

  list(): AgentTrajectory[] {
    return Array.from(this.byId.values()).sort((a, b) => b.recordedAt - a.recordedAt);
  }

  clear(): void {
    this.byId.clear();
  }
}
