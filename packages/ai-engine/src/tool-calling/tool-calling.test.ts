import { describe, it, expect } from 'vitest';
import { parseToolArguments, repairToolCallArguments, isRetryableRepair } from './repair.js';
import { ToolApprovalManager, canExecute } from './approvals.js';

describe('parseToolArguments', () => {
  it('passes objects through', () => {
    const { args, issues } = parseToolArguments({ a: 1 });
    expect(args).toEqual({ a: 1 });
    expect(issues).toHaveLength(0);
  });

  it('parses valid JSON strings', () => {
    const { args, issues } = parseToolArguments('{"path":"a.ts","recursive":true}');
    expect(args.path).toBe('a.ts');
    expect(issues).toHaveLength(0);
  });

  it('repairs fenced, trailing-comma and unquoted-key JSON', () => {
    const { args, issues } = parseToolArguments('```json\n{ path: "a.ts", tags: [1, 2,], }\n```');
    expect(args.path).toBe('a.ts');
    expect(issues.length).toBeGreaterThan(0); // repaired with notes
  });

  it('returns empty args for non-object input', () => {
    expect(parseToolArguments(42).args).toEqual({});
    expect(parseToolArguments('').issues[0]).toContain('empty');
  });
});

describe('repairToolCallArguments', () => {
  const schema = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      limit: { type: 'number' },
      tags: { type: 'array' },
      verbose: { type: 'boolean' },
      mode: { type: 'string', default: 'safe' },
    },
    required: ['path', 'mode'],
  };

  it('coerces types and fills required defaults', () => {
    const result = repairToolCallArguments(
      { path: 123, limit: '5', tags: 'a', verbose: 'true' },
      schema,
    );
    expect(result.args.path).toBe('123');
    expect(result.args.limit).toBe(5);
    expect(result.args.tags).toEqual(['a']);
    expect(result.args.verbose).toBe(true);
    expect(result.repaired).toBe(true);
  });

  it('fills declared default for missing required field', () => {
    const result = repairToolCallArguments({ path: 'x' }, schema);
    expect(result.args.mode).toBe('safe');
    expect(result.issues.some((i) => i.includes('mode'))).toBe(true);
  });

  it('reports missing required fields without defaults', () => {
    const result = repairToolCallArguments({ mode: 'safe' }, schema);
    expect(result.issues.some((i) => i.includes('path'))).toBe(true);
  });

  it('leaves valid calls untouched', () => {
    const result = repairToolCallArguments({ path: 'a', mode: 'safe' }, schema);
    expect(result.repaired).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it('isRetryableRepair reflects validity', () => {
    expect(isRetryableRepair({ args: {}, repaired: true, issues: ['coerced field "x"'] })).toBe(
      true,
    );
    expect(
      isRetryableRepair({ args: {}, repaired: true, issues: ['repair JSON still invalid'] }),
    ).toBe(false);
  });
});

describe('ToolApprovalManager', () => {
  it('collects and approves calls (2-phase)', async () => {
    const manager = new ToolApprovalManager({ timeoutMs: 30 });
    const req = manager.request('write_file', { path: 'a.ts' }, 'editor');
    expect(req.state).toBe('pending');
    expect(manager.pending()).toHaveLength(1);
    expect(canExecute(manager.get(req.call.id))).toBe(false);

    const decided = await manager.awaitDecision(req.call.id);
    expect(decided.state).toBe('denied'); // deny on timeout when no decision arrives
    expect(canExecute(decided)).toBe(false);
  });

  it('session default deny-all denies immediately', () => {
    const manager = new ToolApprovalManager({ sessionDefaults: { default: 'deny-all' } });
    const req = manager.request('run_command', {}, 'default');
    expect(req.state).toBe('denied');
    expect(canExecute(req)).toBe(false);
  });

  it('session default approve-all approves immediately', () => {
    const manager = new ToolApprovalManager({ sessionDefaults: { default: 'approve-all' } });
    const req = manager.request('write_file', {});
    expect(req.state).toBe('approved');
    expect(canExecute(req)).toBe(true);
  });

  it('decideAll approves the whole batch', async () => {
    const manager = new ToolApprovalManager();
    const a = manager.request('write_file', {}, 'role-x');
    const b = manager.request('replace_file', {}, 'role-x');
    expect(manager.pending()).toHaveLength(2);
    manager.decideAll('approved', 'test');
    expect(a.state).toBe('approved');
    expect(b.state).toBe('approved');
  });

  it('awaitDecision resolves after explicit approve', async () => {
    const manager = new ToolApprovalManager();
    const req = manager.request('write_file', {}, 'role-x');
    setTimeout(() => manager.approve(req.call.id, 'test'), 20);
    const decided = await manager.awaitDecision(req.call.id);
    expect(decided.state).toBe('approved');
  });
});
