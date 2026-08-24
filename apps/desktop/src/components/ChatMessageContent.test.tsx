// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock i18n
const tMock = vi.fn((key: string) => {
  const translations: Record<string, string> = {
    'chat.runningCmd': 'Running...',
    'chat.runSuccessNoOutput': 'Success — no output',
    'chat.runError': 'Error',
    'common.copy': 'Copy',
    'common.copied': 'Copied',
    'common.run': 'Run',
  };
  return translations[key] ?? key;
});

vi.mock('../i18n', () => ({
  useTranslation: () => ({ t: tMock }),
}));

// Mock shell utilities
vi.mock('../utils/shell', () => ({
  assessShellCommand: vi.fn(() => ({ safe: true, threatLevel: 'LOW' })),
  runCommand: vi.fn(async (cmd: string) => ({
    success: true,
    stdout: `Executed: ${cmd}`,
    stderr: '',
    code: 0,
  })),
}));

// Mock clipboard API (happy-dom uses getter-only, need Object.defineProperty)
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
  configurable: true,
});

import { MarkdownMessage } from './ChatMessageContent';

describe('MarkdownMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders plain text content', () => {
    render(<MarkdownMessage content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<MarkdownMessage content="This is **bold** text" />);
    expect(screen.getByText('bold')).toBeInTheDocument();
  });

  it('renders italic text', () => {
    render(<MarkdownMessage content="This is *italic* text" />);
    expect(screen.getByText('italic')).toBeInTheDocument();
  });

  it('renders unordered list', () => {
    render(
      <MarkdownMessage
        content={`- Item 1
- Item 2`}
      />,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders ordered list', () => {
    render(
      <MarkdownMessage
        content={`1. First
2. Second`}
      />,
    );
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders links with target="_blank"', () => {
    render(<MarkdownMessage content="[Click me](https://example.com)" />);
    const link = screen.getByText('Click me');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', 'https://example.com');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('renders inline code', () => {
    render(<MarkdownMessage content="Use the `foobar()` function" />);
    const codeElement = screen.getByText('foobar()');
    expect(codeElement).toBeInTheDocument();
  });

  describe('edge cases', () => {
    it('renders empty content without crashing', () => {
      const { container } = render(<MarkdownMessage content="" />);
      // Should render a root element with no visible text content
      expect(container.textContent).toBe('');
      expect(container.querySelector('p')).not.toBeInTheDocument();
    });

    it('renders whitespace-only content without crashing', () => {
      // Markdown parser may produce empty <p> or whitespace-only text nodes;
      // the critical requirement is that it does NOT throw
      expect(() => render(<MarkdownMessage content="   \n  \t  " />)).not.toThrow();
    });

    it('renders very long content (>5000 chars) efficiently', () => {
      const paragraph = 'Lorem ipsum dolor sit amet. '.repeat(300); // ~8400 chars
      const longContent = [
        '# Very Long Document',
        '',
        paragraph,
        '',
        'Some **bold** and *italic* text.',
        '',
        '- Item 1',
        '- Item 2',
        '',
        '| Col1 | Col2 |',
        '|------|------|',
        '| A    | B    |',
        '',
        '> A final blockquote.',
      ].join('\n');

      expect(longContent.length).toBeGreaterThan(5000);

      const start = performance.now();
      const { container } = render(<MarkdownMessage content={longContent} />);
      const elapsed = performance.now() - start;

      // Should render under 2 seconds (generous for CI)
      expect(elapsed).toBeLessThan(2000);

      // Critical content should be present
      expect(container.textContent).toContain('Very Long Document');
      expect(container.textContent).toContain('bold');
      expect(container.textContent).toContain('italic');
      expect(container.textContent).toContain('Item 1');
      expect(container.textContent).toContain('Col1');
      expect(container.textContent).toContain('A final blockquote');
    });

    it('renders content with only special characters / emoji', () => {
      render(<MarkdownMessage content="🎉 ✅ ❌ 👨‍💻 #hashtag @mention" />);
      expect(screen.getByText(/🎉/)).toBeInTheDocument();
      expect(screen.getByText(/✅/)).toBeInTheDocument();
      expect(screen.getByText(/❌/)).toBeInTheDocument();
    });

    it('renders content with XSS-like strings safely (sanitized)', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img onerror="alert(1)" src="x">',
        '<a href="javascript:alert(1)">click</a>',
      ];

      for (const payload of xssPayloads) {
        const { container } = render(<MarkdownMessage content={payload} />);
        // Script tags should be sanitized away, not executed
        expect(container.querySelector('script')).not.toBeInTheDocument();
        expect(container.querySelector('[onerror]')).not.toBeInTheDocument();
        // javascript: URIs on links should be stripped
        expect(container.querySelector('a[href^="javascript:"]')).not.toBeInTheDocument();
      }
    });

    it('renders deeply nested markdown structure without stack overflow', () => {
      // Simulate deeply nested blockquotes (> 20 levels deep)
      const nestedDepth = 30;
      const nested =
        `${Array.from({ length: nestedDepth }, () => '> ').join('')  }Level ${nestedDepth}`;

      expect(() => render(<MarkdownMessage content={nested} />)).not.toThrow();
      expect(screen.getByText(`Level ${nestedDepth}`)).toBeInTheDocument();
    });

    it('handles consecutive backtick code fences gracefully', () => {
      // Three backticks inside inline code should not break the parser
      const content = ['Inline: `` `code` `` is fine.', '', '```', 'fence', '```'].join('\n');

      expect(() => render(<MarkdownMessage content={content} />)).not.toThrow();
      expect(screen.getByText('fence')).toBeInTheDocument();
    });
  });
});

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a code block with copy and run buttons', () => {
    const code = 'console.log("hello")';
    render(<MarkdownMessage content={`\`\`\`javascript\n${code}\n\`\`\``} />);

    // Should display the code content
    expect(screen.getByText(code)).toBeInTheDocument();
    // Should show the language label (lowercase in DOM; CSS text-transform uppercases visually)
    expect(screen.getByText('javascript')).toBeInTheDocument();
    // Should have the copy button
    expect(screen.getByText('📋 Copy')).toBeInTheDocument();
  });

  it('renders shell command block with run button', () => {
    const code = 'echo "hello world"';
    render(<MarkdownMessage content={`\`\`\`bash\n${code}\n\`\`\``} />);

    expect(screen.getByText(code)).toBeInTheDocument();
    expect(screen.getByText('▶ Run')).toBeInTheDocument();
  });

  it('copies code to clipboard when copy button is clicked', async () => {
    const code = 'const x = 1;';
    render(<MarkdownMessage content={`\`\`\`js\n${code}\n\`\`\``} />);

    const copyButton = screen.getByText('📋 Copy');
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code);
    // Should show "✓ Copied" after copy
    expect(screen.getByText('✓ Copied')).toBeInTheDocument();
  });

  it('renders table', () => {
    const markdown = [
      '| Name | Value |',
      '|------|-------|',
      '| A    | 1     |',
      '| B    | 2     |',
    ].join('\n');

    render(<MarkdownMessage content={markdown} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('renders blockquote', () => {
    render(<MarkdownMessage content="> This is a quote" />);
    expect(screen.getByText('This is a quote')).toBeInTheDocument();
  });
});
