// @vitest-environment happy-dom

// CodeEditor component tests — standard vs diff (AI proposal) rendering.
// Monaco setup is lazy-loaded on first mount, so the editor appears after a
// microtask; assertions use findBy* / waitFor accordingly.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

// The lazy monaco-setup module wires real ?worker imports that cannot run
// under happy-dom; stub it so the dynamic import resolves instantly.
vi.mock('../lib/monaco-setup', () => ({}));

// Monaco cannot run under happy-dom; mock it with lightweight stand-ins that
// expose which editor variant (standard vs diff) is rendered.
vi.mock('@monaco-editor/react', () => ({
  default: (props: { value?: string; onChange?: (v: string) => void }) => (
    <div
      data-testid="monaco-editor"
      data-value={props.value}
      onClick={() => props.onChange?.('EDITED')}
    />
  ),
  DiffEditor: (props: { original?: string; modified?: string }) => (
    <div data-testid="monaco-diff" data-original={props.original} data-modified={props.modified} />
  ),
}));

import { CodeEditor } from './CodeEditor';

describe('CodeEditor', () => {
  it('renders the standard Monaco editor when no originalValue is given', async () => {
    render(<CodeEditor value="const a = 1;" language="typescript" />);
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toBeInTheDocument());
    expect(screen.queryByTestId('monaco-diff')).toBeNull();
  });

  it('switches to a diff editor when originalValue is provided (AI proposal review)', async () => {
    render(<CodeEditor value="const a = 2;" originalValue="const a = 1;" language="typescript" />);
    const diff = await screen.findByTestId('monaco-diff');
    expect(diff).toBeInTheDocument();
    expect(diff.getAttribute('data-original')).toBe('const a = 1;');
    expect(diff.getAttribute('data-modified')).toBe('const a = 2;');
    expect(screen.queryByTestId('monaco-editor')).toBeNull();
  });

  it('propagates edits through onChange', async () => {
    const onChange = vi.fn();
    render(<CodeEditor value="x" onChange={onChange} />);
    const editor = await screen.findByTestId('monaco-editor');
    fireEvent.click(editor);
    expect(onChange).toHaveBeenCalledWith('EDITED');
  });
});
