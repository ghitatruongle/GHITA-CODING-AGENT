// ==============================================================================
// v0.4.9 A3: Agent Work Loop Harness Unit Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  WorkLoopEvaluator,
  checkToDimension,
  applyRepairProgress,
  renderSessionReport,
} from '../src/harness/index.js';
import type { TaskEpisode, WorkLoopFinding, CheckResult } from '../src/harness/index.js';

function episode(checks: CheckResult[], sessionLinked = true): TaskEpisode {
  return { id: 'ep-1', goal: 'Refactor login flow', sessionLinked, checks };
}

describe('checkToDimension', () => {
  it('maps checks to their owning dimension', () => {
    expect(checkToDimension('goal-understanding')).toBe('task-understanding');
    expect(checkToDimension('permission-boundary')).toBe('controlled-execution');
    expect(checkToDimension('validate-again')).toBe('change-validation');
    expect(checkToDimension('rollback-recovery')).toBe('reliable-delivery');
    expect(checkToDimension('loop-engineering')).toBe('learning-capture');
  });
});

describe('WorkLoopEvaluator', () => {
  it('caps dimension score at the evidence ceiling', () => {
    const review = new WorkLoopEvaluator().evaluate(
      episode([
        { checkId: 'goal-understanding', state: 'Present', summary: 'acceptance recovered' },
        { checkId: 'relevant-context', state: 'Present', summary: 'owner chain followed' },
        { checkId: 'scope-boundary', state: 'Present', summary: 'diff within scope' },
      ]),
    );
    const td = review.dimensions.find((d) => d.dimension === 'task-understanding')!;
    expect(td.ceiling).toBe(74);
    expect(td.score).toBeLessThanOrEqual(74);
    expect(td.highestEvidence).toBe('Present');
  });

  it('reaches the exercised ceiling when a check is exercised', () => {
    const review = new WorkLoopEvaluator().evaluate(
      episode([
        { checkId: 'relevant-check', state: 'Exercised', summary: 'ran scoped tests' },
        { checkId: 'failure-repair', state: 'Not applicable', summary: 'no failure' },
        { checkId: 'validate-again', state: 'Not applicable', summary: 'no repair' },
      ]),
    );
    const cv = review.dimensions.find((d) => d.dimension === 'change-validation')!;
    expect(cv.ceiling).toBe(94);
    expect(cv.score).toBe(94);
  });

  it('keeps a dimension at 59 or lower when a required check is Missing', () => {
    const review = new WorkLoopEvaluator().evaluate(
      episode([
        { checkId: 'acceptance-evidence', state: 'Missing', summary: 'no PR decision' },
        { checkId: 'high-risk-approval', state: 'Present', summary: 'approval present' },
        { checkId: 'rollback-recovery', state: 'Present', summary: 'rollback present' },
      ]),
    );
    const rd = review.dimensions.find((d) => d.dimension === 'reliable-delivery')!;
    expect(rd.score).toBeLessThanOrEqual(59);
  });

  it('floors learning-capture at 35', () => {
    const review = new WorkLoopEvaluator().evaluate(
      episode([
        { checkId: 'lifecycle-repeat-detection', state: 'Unobserved', summary: 'n/a' },
        { checkId: 'loop-engineering', state: 'Missing', summary: 'no owner' },
        { checkId: 'later-validation', state: 'Unobserved', summary: 'no later window' },
      ]),
    );
    const lc = review.dimensions.find((d) => d.dimension === 'learning-capture')!;
    expect(lc.score).toBeGreaterThanOrEqual(35);
  });

  it('marks the review session-limited when no session evidence', () => {
    const review = new WorkLoopEvaluator().evaluate(episode([], false));
    expect(review.sessionLimited).toBe(true);
    // all dimensions default to Unobserved → ceiling 59
    expect(review.dimensions.every((d) => d.ceiling === 59)).toBe(true);
  });

  it('open findings reduce the affected dimension score', () => {
    const findings: WorkLoopFinding[] = [
      {
        id: 'F1',
        primaryCheck: 'scope-boundary',
        severity: 'high',
        problem: 'scope creep',
        impact: 'unrelated files changed',
        repair: 'revert unrelated edits',
        validationRoute: 'git diff review',
      },
    ];
    const checks: CheckResult[] = [
      { checkId: 'goal-understanding', state: 'Wired', summary: 'ok' },
      { checkId: 'relevant-context', state: 'Wired', summary: 'ok' },
      { checkId: 'scope-boundary', state: 'Wired', summary: 'ok' },
    ];
    const withFinding = new WorkLoopEvaluator().evaluate(episode(checks), findings);
    const withoutFinding = new WorkLoopEvaluator().evaluate(episode(checks), []);
    const dimWith = withFinding.dimensions.find((d) => d.dimension === 'task-understanding')!;
    const dimWithout = withoutFinding.dimensions.find((d) => d.dimension === 'task-understanding')!;
    expect(dimWith.score).toBeLessThan(dimWithout.score);
  });
});

describe('applyRepairProgress', () => {
  it('updates only the targeted finding', () => {
    const findings: WorkLoopFinding[] = [
      { id: 'F1', primaryCheck: 'scope-boundary', severity: 'low', problem: 'p', impact: 'i', repair: 'r', validationRoute: 'v' },
      { id: 'F2', primaryCheck: 'relevant-check', severity: 'low', problem: 'p', impact: 'i', repair: 'r', validationRoute: 'v' },
    ];
    const updated = applyRepairProgress(findings, 'F1', 'verified');
    expect(updated.find((f) => f.id === 'F1')!.repairProgress).toBe('verified');
    expect(updated.find((f) => f.id === 'F2')!.repairProgress).toBeUndefined();
  });
});

describe('renderSessionReport', () => {
  it('renders dimensions, findings and session-limited note', () => {
    const review = new WorkLoopEvaluator().evaluate(
      episode(
        [{ checkId: 'goal-understanding', state: 'Wired', summary: 'ok' }],
        false,
      ),
      [
        {
          id: 'F1',
          primaryCheck: 'goal-understanding',
          severity: 'medium',
          problem: 'vague acceptance',
          impact: 'ambiguous done',
          repair: 'record acceptance criteria',
          validationRoute: 'review spec',
        },
      ],
    );
    const md = renderSessionReport(review);
    expect(md).toContain('# Agent Work Loop Report');
    expect(md).toContain('session-limited');
    expect(md).toContain('F1');
    expect(md).toContain('Loop Effectiveness');
  });
});
