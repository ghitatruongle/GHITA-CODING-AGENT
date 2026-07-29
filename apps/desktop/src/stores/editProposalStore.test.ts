// ==============================================================================
// Tests for the AI edit-proposal store
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditProposalStore } from './editProposalStore';

const input = {
  path: '/ws/a.ts',
  fileName: 'a.ts',
  language: 'typescript',
  originalContent: 'let x = 1;\n',
};

describe('useEditProposalStore', () => {
  beforeEach(() => {
    useEditProposalStore.getState().clear();
  });

  it('proposeWrite adds a pending proposal retrievable by path', () => {
    const id = useEditProposalStore.getState().proposeWrite(input, 'let x = 2;\n');
    const p = useEditProposalStore.getState().getForPath('/ws/a.ts');
    expect(p?.id).toBe(id);
    expect(p?.proposedContent).toBe('let x = 2;\n');
  });

  it('proposeReplace succeeds for a unique target', () => {
    const res = useEditProposalStore.getState().proposeReplace(input, 'let x = 1;', 'let x = 9;');
    expect(res.ok).toBe(true);
    const p = useEditProposalStore.getState().getForPath('/ws/a.ts');
    expect(p?.proposedContent).toBe('let x = 9;\n');
  });

  it('proposeReplace returns an error for a missing target (no proposal added)', () => {
    const res = useEditProposalStore.getState().proposeReplace(input, 'nope', 'x');
    expect(res.ok).toBe(false);
    expect(useEditProposalStore.getState().getForPath('/ws/a.ts')).toBeUndefined();
  });

  it('latest proposal for a path replaces the previous one', () => {
    useEditProposalStore.getState().proposeWrite(input, 'v1');
    useEditProposalStore.getState().proposeWrite(input, 'v2');
    const forPath = useEditProposalStore.getState().proposals.filter((p) => p.path === '/ws/a.ts');
    expect(forPath).toHaveLength(1);
    expect(forPath[0]?.proposedContent).toBe('v2');
  });

  it('remove deletes a proposal by id', () => {
    const id = useEditProposalStore.getState().proposeWrite(input, 'x');
    useEditProposalStore.getState().remove(id);
    expect(useEditProposalStore.getState().getForPath('/ws/a.ts')).toBeUndefined();
  });

  it('removeForPath clears proposals for a path', () => {
    useEditProposalStore.getState().proposeWrite(input, 'x');
    useEditProposalStore.getState().removeForPath('/ws/a.ts');
    expect(useEditProposalStore.getState().proposals).toHaveLength(0);
  });

  it('keeps separate proposals for different paths', () => {
    useEditProposalStore.getState().proposeWrite(input, 'x');
    useEditProposalStore
      .getState()
      .proposeWrite({ ...input, path: '/ws/b.ts', fileName: 'b.ts' }, 'y');
    expect(useEditProposalStore.getState().proposals).toHaveLength(2);
    expect(useEditProposalStore.getState().getForPath('/ws/b.ts')?.proposedContent).toBe('y');
  });
});
