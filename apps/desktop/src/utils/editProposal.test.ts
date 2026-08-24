// Tests for the AI edit-proposal engine (pure logic)

import { describe, it, expect } from 'vitest';
import {
  applyReplace,
  lineDiffStat,
  buildReplaceProposal,
  buildWriteProposal,
  newProposalId,
} from './editProposal';

const input = {
  path: '/ws/app.ts',
  fileName: 'app.ts',
  language: 'typescript',
  originalContent: 'const port = 3000;\nconst host = "localhost";\n',
};

describe('applyReplace', () => {
  it('replaces a unique target block', () => {
    const r = applyReplace('a\nb\nc\n', 'b', 'B');
    expect(r).toEqual({ ok: true, proposedContent: 'a\nB\nc\n' });
  });

  it('fails when the target is empty', () => {
    const r = applyReplace('abc', '', 'x');
    expect(r.ok).toBe(false);
  });

  it('fails when the target is not found', () => {
    const r = applyReplace('abc', 'zzz', 'x');
    expect(r).toEqual({ ok: false, error: 'Target content not found in the file.' });
  });

  it('fails when the target appears more than once', () => {
    const r = applyReplace('x\nx\n', 'x', 'y');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/multiple times/i);
  });
});

describe('lineDiffStat', () => {
  it('reports unchanged for identical content', () => {
    expect(lineDiffStat('a\nb', 'a\nb')).toEqual({ added: 0, removed: 0, unchanged: true });
  });

  it('counts a single changed line as +1/-1', () => {
    const s = lineDiffStat('a\nb\nc', 'a\nB\nc');
    expect(s).toEqual({ added: 1, removed: 1, unchanged: false });
  });

  it('counts pure additions', () => {
    const s = lineDiffStat('a\nb', 'a\nb\nc\nd');
    expect(s).toEqual({ added: 2, removed: 0, unchanged: false });
  });

  it('counts pure removals', () => {
    const s = lineDiffStat('a\nb\nc\nd', 'a\nb');
    expect(s).toEqual({ added: 0, removed: 2, unchanged: false });
  });
});

describe('buildReplaceProposal', () => {
  it('produces a pending proposal with proposed content applied', () => {
    const r = buildReplaceProposal(input, 'const port = 3000;', 'const port = 8080;');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.proposal.status).toBe('pending');
      expect(r.proposal.proposedContent).toBe('const port = 8080;\nconst host = "localhost";\n');
      expect(r.proposal.originalContent).toBe(input.originalContent);
      expect(r.proposal.path).toBe('/ws/app.ts');
    }
  });

  it('returns an error when the target cannot be located', () => {
    const r = buildReplaceProposal(input, 'const missing = 1;', 'x');
    expect(r.ok).toBe(false);
  });
});

describe('buildWriteProposal', () => {
  it('carries the whole proposed content and a unique id', () => {
    const p1 = buildWriteProposal(input, 'new content');
    const p2 = buildWriteProposal(input, 'other content');
    expect(p1.proposedContent).toBe('new content');
    expect(p1.status).toBe('pending');
    expect(p1.id).not.toBe(p2.id);
  });
});

describe('newProposalId', () => {
  it('generates monotonically unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newProposalId()));
    expect(ids.size).toBe(50);
  });
});
