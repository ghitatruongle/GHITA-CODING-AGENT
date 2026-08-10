import { describe, it, expect } from 'vitest';
import { RequestHumanInputManager, buildRequestHumanInputTool } from './hitl.js';
import { AgentLifecycleManager } from './lifecycle.js';
import { GitAutoCommitPolicy, createGitOps } from './autocommit.js';
import { PRReviewPipeline, renderReviewReport } from './review.js';
import { parseAgentDefinition, dispatchAgentTasks, isToolAllowed } from './declarative.js';
import { classifyError, compactErrorForContext, backoffForAttempt } from './error-compact.js';
import { RemoteJobStatusProvider } from './remote.js';

describe('RequestHumanInputManager', () => {
  it('asks, waits and resumes with an answer', async () => {
    const manager = new RequestHumanInputManager({ timeoutMs: 0 });
    const req = manager.request({ question: 'Proceed?', options: ['yes', 'no'] });
    setTimeout(() => manager.answer(req.id, 'yes'), 15);
    const answered = await manager.awaitAnswer(req.id);
    expect(answered.state).toBe('answered');
    expect(answered.answer).toBe('yes');
  });

  it('rejects answers outside single-choice options', () => {
    const manager = new RequestHumanInputManager({ timeoutMs: 0 });
    const req = manager.request({ question: 'Pick', options: ['a', 'b'], format: 'single-choice' });
    expect(manager.answer(req.id, 'c')).toBe(false);
    expect(manager.answer(req.id, 'a')).toBe(true);
  });

  it('times out pending requests', async () => {
    const manager = new RequestHumanInputManager({ timeoutMs: 10 });
    const req = manager.request({ question: 'q' });
    await new Promise((r) => setTimeout(r, 40));
    expect(manager.get(req.id)?.state).toBe('timed-out');
  });

  it('exposes a tool handler', async () => {
    const manager = new RequestHumanInputManager({ timeoutMs: 0 });
    const tool = buildRequestHumanInputTool(manager);
    setTimeout(
      () => manager.answer(tool.handler.name === '' ? '' : (manager.pending()[0]?.id ?? ''), 'ok'),
      10,
    );
    const res = await tool.handler({ question: 'go?' });
    expect(res.content[0]?.text).toContain('user answered');
  });
});

describe('AgentLifecycleManager', () => {
  it('launches, pauses, resumes and enumerates', async () => {
    const manager = new AgentLifecycleManager();
    const run = manager.launch('task-a', async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(manager.enumerate('running')).toHaveLength(1);
    expect(manager.pause(run.id)).toBe(true);
    expect(manager.get(run.id)?.state).toBe('paused');
    expect(manager.resume(run.id)).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(manager.get(run.id)?.state).toBe('completed');
    expect(manager.count()['completed']).toBe(1);
  });

  it('marks failed runs with error', async () => {
    const manager = new AgentLifecycleManager();
    const run = manager.launch('bad', async () => {
      throw new Error('kaboom');
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(manager.get(run.id)?.state).toBe('error');
    expect(manager.get(run.id)?.error).toContain('kaboom');
  });
});

describe('GitAutoCommitPolicy', () => {
  it('respects mode ask/always/never', () => {
    expect(new GitAutoCommitPolicy({ mode: 'always' }).decide().commit).toBe(true);
    expect(new GitAutoCommitPolicy({ mode: 'ask' }).decide().promptUser).toBe(true);
    expect(new GitAutoCommitPolicy({ mode: 'never' }).decide().commit).toBe(false);
  });

  it('skips clean trees and commits dirty ones', () => {
    const git = {
      isClean: () => true,
      commitAll: () => ({ ok: true, sha: 'abc123' }),
    };
    const policy = new GitAutoCommitPolicy({ mode: 'always' });
    expect(policy.apply(git, 'cp-1').committed).toBe(false); // clean
    expect(
      policy.apply({ isClean: () => false, commitAll: () => ({ ok: true, sha: 'abc' }) }, 'cp-1')
        .commitSha,
    ).toBe('abc');
  });

  it('createGitOps reports nothing-to-commit as ok', () => {
    const git = (_dir: string, args: string[]) => {
      const cmd = args.join(' ');
      if (cmd.includes('status')) return { ok: true, stdout: '', stderr: '' };
      if (cmd.includes('commit')) return { ok: false, stdout: '', stderr: 'nothing to commit' };
      return { ok: true, stdout: 'x', stderr: '' };
    };
    const ops = createGitOps('/repo', git);
    expect(ops.isClean()).toBe(true);
    expect(ops.commitAll('m').ok).toBe(true);
  });
});

describe('PRReviewPipeline', () => {
  it('runs gate, reviewers and second-pass validation', async () => {
    const pipeline = new PRReviewPipeline(
      [
        {
          role: 'bug-hunter',
          review: async () => [{ id: 'f1', severity: 'warning' as const, message: 'Possible NPE' }],
        },
        {
          role: 'compliance',
          review: async () => [
            { id: 'f2', severity: 'critical' as const, message: 'Missing check' },
          ],
        },
      ],
      async (finding) => finding.id !== 'f1', // second pass rejects f1 (false positive)
    );
    const report = await pipeline.review({ title: 't', diff: 'd' });
    expect(report.findings).toHaveLength(2);
    expect(report.findings.find((f) => f.id === 'f1')?.validated).toBe(false);
    expect(report.findings.find((f) => f.id === 'f2')?.validated).toBe(true);
    expect(report.blocked).toBe(true);
    expect(renderReviewReport(report)).toContain('Blocked');
  });

  it('blocks on gate failure', async () => {
    const pipeline = new PRReviewPipeline([], async () => ({
      passed: false,
      reason: 'no checklist',
    }));
    const report = await pipeline.review({ title: 't', diff: 'd' });
    expect(report.gated).toBe(true);
    expect(report.blocked).toBe(true);
  });
});

describe('declarative subagents', () => {
  it('parses agent definitions from markdown', () => {
    const def = parseAgentDefinition(
      '---\nname: auditor\ndescription: Reviews changes\nallowed-tools: Read Grep\nmodel: smol\nconcurrency: 2\n---\nbody',
      'fallback',
    );
    expect(def.name).toBe('auditor');
    expect(def.allowedTools).toEqual(['read', 'grep']);
    expect(def.model).toBe('smol');
    expect(def.concurrency).toBe(2);
    expect(isToolAllowed(def, 'READ')).toBe(true);
    expect(isToolAllowed(def, 'write')).toBe(false);
  });

  it('dispatches tasks with bounded concurrency', async () => {
    const def = { name: 'w', description: '', allowedTools: [], concurrency: 2 };
    const tasks = [
      { id: '1', prompt: 'a' },
      { id: '2', prompt: 'b' },
      { id: '3', prompt: 'c' },
    ];
    const results = await dispatchAgentTasks(def, tasks, async (_, task) => ({
      taskId: task.id,
      output: task.prompt,
    }));
    expect(results.map((r) => r.taskId).sort()).toEqual(['1', '2', '3']);
  });
});

describe('error compaction', () => {
  it('classifies common errors', () => {
    expect(classifyError(new Error('request timed out after 30s')).category).toBe('timeout');
    expect(classifyError(new Error('429 Too Many Requests')).category).toBe('rate-limit');
    expect(classifyError(new Error('SyntaxError: unexpected token')).category).toBe('parse');
    expect(classifyError(new Error('EACCES permission denied')).category).toBe('permission');
    expect(classifyError(new Error('weird thing')).category).toBe('unknown');
  });

  it('formats compact context lines', () => {
    const line = compactErrorForContext(new Error('invalid JSON'), 2);
    expect(line).toContain('ERROR (attempt 2)');
    expect(line).toContain('[parse]');
    expect(backoffForAttempt(1)).toBe(1000);
    expect(backoffForAttempt(6)).toBe(30000);
  });
});

describe('RemoteJobStatusProvider', () => {
  it('lists jobs and applies resume from the phone', async () => {
    const lifecycle = new AgentLifecycleManager();
    const run = lifecycle.launch('job-1', async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    lifecycle.pause(run.id);
    const provider = new RemoteJobStatusProvider(lifecycle);
    expect(provider.listJobs()[0]?.state).toBe('paused');
    expect(provider.applyAction({ jobId: run.id, action: 'resume' }).ok).toBe(true);
    expect(provider.recentActions()).toHaveLength(1);
  });
});
