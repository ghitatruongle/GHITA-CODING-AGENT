// @vitest-environment happy-dom
// ==============================================================================
// CodeEditor component tests — standard vs diff (AI proposal) rendering
// ==============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

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
  it('renders the standard Monaco editor when no originalValue is given', () => {
    render(<CodeEditor value="const a = 1;" language="typescript" />);
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('monaco-diff')).toBeNull();
  });

  it('switches to a diff editor when originalValue is provided (AI proposal review)', () => {
    render(
      <CodeEditor value="const a = 2;" originalValue="const a = 1;" language="typescript" />,
    );
    const diff = screen.getByTestId('monaco-diff');
    expect(diff).toBeInTheDocument();
    expect(diff.getAttribute('data-original')).toBe('const a = 1;');
    expect(diff.getAttribute('data-modified')).toBe('const a = 2;');
    expect(screen.queryByTestId('monaco-editor')).toBeNull();
  });

  it('propagates edits through onChange', () => {
    const onChange = vi.fn();
    render(<CodeEditor value="x" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('monaco-editor'));
    expect(onChange).toHaveBeenCalledWith('EDITED');
  });
});
