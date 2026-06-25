import { Children, isValidElement, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { assessShellCommand, runCommand } from '../utils/shell';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';

interface ComputerUsePreviewProps {
  preview: {
    screenshot: string;
    point?: { x: number; y: number };
    box?: { x1: number; y1: number; x2: number; y2: number };
  };
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const permissionMode = useAppStore((s) => s.permissionMode);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isShellCommand =
    !lang ||
    lang === 'cmd' ||
    lang === 'powershell' ||
    lang === 'shell' ||
    lang === 'bash' ||
    lang === 'sh';
  const isRunnable = isShellCommand && code.split('\n').filter((line) => line.trim()).length <= 3;

  const handleRun = async () => {
    const command = code.trim();
    const assessment = assessShellCommand(command);
    if (!assessment.safe && assessment.threatLevel === 'CRITICAL') {
      setOutput(`Blocked by security policy: ${assessment.reason || 'Unsafe command detected.'}`);
      return;
    }

    // In auto mode, skip confirmation for safe commands
    const needsApproval = permissionMode === 'custom' || !assessment.safe;
    if (needsApproval) {
      const warningPrefix = !assessment.safe
        ? `Warning (${assessment.threatLevel}): ${assessment.reason}\n\n`
        : '';
      if (!window.confirm(`${warningPrefix}Run this command?\n\n${command}`)) return;
    }

    setIsRunning(true);
    setOutput(t('chat.runningCmd'));
    const result = await runCommand(command);
    if (result.success) {
      setOutput(result.stdout || t('chat.runSuccessNoOutput'));
    } else {
      setOutput(
        result.stderr || result.stdout || `(${t('chat.runError')}, exit code: ${result.code})`,
      );
    }
    setIsRunning(false);
  };

  return (
    <div
      style={{
        margin: '8px 0',
        borderRadius: '6px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px',
          fontSize: '10px',
          color: '#64748b',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{lang || 'command'}</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
              color: copied ? '#34d399' : '#94a3b8',
              border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '10px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }
            }}
          >
            {copied ? `✓ ${t('common.copied')}` : `📋 ${t('common.copy')}`}
          </button>
          {isRunnable && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              style={{
                background: isRunning ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.6)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 10px',
                fontSize: '10px',
                cursor: isRunning ? 'default' : 'pointer',
                fontWeight: 600,
              }}
            >
              {isRunning ? `⏳ ${t('chat.runningCmd')}` : `▶ ${t('common.run')}`}
            </button>
          )}
        </div>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '10px',
          fontSize: '12px',
          color: '#e2e8f0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          overflow: 'auto',
          maxHeight: '200px',
          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        }}
      >
        {code}
      </pre>
      {output && (
        <div
          style={{
            padding: '8px 10px',
            fontSize: '11px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(0,0,0,0.2)',
            color:
              output.includes(t('chat.runError')) ||
              output.toLowerCase().includes('error') ||
              output.includes('错误')
                ? '#f87171'
                : '#86efac',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: '120px',
            overflow: 'auto',
            fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          }}
        >
          {output}
        </div>
      )}
    </div>
  );
}

const COMPUTER_USE_KEYFRAMES = `
  @keyframes dashOffset {
    to {
      stroke-dashoffset: -1000;
    }
  }
  @keyframes sonarPulse {
    0% {
      transform: translate(-50%, -50%) scale(0.4);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) scale(1.6);
      opacity: 0;
    }
  }
  @keyframes computerUsePulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0.4; }
  }
`;

export function ComputerUsePreviewComponent({ preview }: ComputerUsePreviewProps) {
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setHoverPos({ x, y });
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  const imgSrc = preview.screenshot.startsWith('data:')
    ? preview.screenshot
    : `data:image/png;base64,${preview.screenshot}`;

  const point = preview.point;
  const box = preview.box;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        marginTop: '8px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
        maxWidth: '100%',
        backgroundColor: '#0b0f19',
        cursor: 'crosshair',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
      }}
    >
      <img
        src={imgSrc}
        alt="Computer Use Screenshot"
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          maxHeight: '400px',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />

      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {point && (
          <line
            x1="50%"
            y1="50%"
            x2={`${point.x * 100}%`}
            y2={`${point.y * 100}%`}
            stroke="#f43f5e"
            strokeWidth="2"
            strokeDasharray="4 4"
            filter="url(#glow)"
            style={{
              opacity: 0.75,
              animation: 'dashOffset 30s linear infinite',
            }}
          />
        )}

        {hoverPos && (
          <line
            x1="50%"
            y1="50%"
            x2={`${hoverPos.x * 100}%`}
            y2={`${hoverPos.y * 100}%`}
            stroke="#818cf8"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            style={{
              opacity: 0.6,
            }}
          />
        )}
      </svg>

      {hoverPos && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${hoverPos.y * 100}%`,
              height: '1px',
              borderTop: '1px dashed rgba(129, 140, 248, 0.4)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${hoverPos.x * 100}%`,
              width: '1px',
              borderLeft: '1px dashed rgba(129, 140, 248, 0.4)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        </>
      )}

      {box && (
        <div
          style={{
            position: 'absolute',
            left: `${box.x1 * 100}%`,
            top: `${box.y1 * 100}%`,
            width: `${(box.x2 - box.x1) * 100}%`,
            height: `${(box.y2 - box.y1) * 100}%`,
            border: '2px solid #38bdf8',
            boxShadow: '0 0 12px rgba(56, 189, 248, 0.4), inset 0 0 6px rgba(56, 189, 248, 0.2)',
            borderRadius: '4px',
            pointerEvents: 'none',
            zIndex: 8,
            animation: 'computerUsePulse 2.5s infinite ease-in-out',
          }}
        />
      )}

      {point && (
        <>
          <div
            style={{
              position: 'absolute',
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '2px solid #f43f5e',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 12,
              animation: 'sonarPulse 1.8s infinite cubic-bezier(0.215, 0.610, 0.355, 1)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#f43f5e',
              border: '2px solid #ffffff',
              boxShadow: '0 0 10px #f43f5e',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 13,
            }}
          />
        </>
      )}

      {hoverPos && (
        <div
          style={{
            position: 'absolute',
            left: `${hoverPos.x * 100}%`,
            top: `${hoverPos.y * 100}%`,
            transform: `translate(${hoverPos.x > 0.7 ? '-110%' : '15px'}, ${hoverPos.y > 0.7 ? '-110%' : '15px'})`,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            borderRadius: '6px',
            padding: '6px 10px',
            color: '#f8fafc',
            fontSize: '11px',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            zIndex: 20,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            whiteSpace: 'nowrap',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
            <span style={{ color: '#818cf8', fontWeight: 'bold' }}>X:</span>
            <span>{(hoverPos.x * 100).toFixed(1)}%</span>
            <span style={{ color: '#94a3b8' }}>({(hoverPos.x * 1000).toFixed(0)})</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
            <span style={{ color: '#818cf8', fontWeight: 'bold' }}>Y:</span>
            <span>{(hoverPos.y * 100).toFixed(1)}%</span>
            <span style={{ color: '#94a3b8' }}>({(hoverPos.y * 1000).toFixed(0)})</span>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: COMPUTER_USE_KEYFRAMES }} />
    </div>
  );
}

function extractTextContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return extractTextContent(child.props.children ?? '');
      }
      return '';
    })
    .join('');
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
        ul: ({ children }) => (
          <ul style={{ margin: '0 0 8px 0', paddingLeft: '18px' }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ margin: '0 0 8px 0', paddingLeft: '18px' }}>{children}</ol>
        ),
        li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
        blockquote: ({ children }) => (
          <blockquote
            style={{
              margin: '0 0 8px 0',
              padding: '0 0 0 12px',
              borderLeft: '3px solid rgba(129, 140, 248, 0.5)',
              color: '#cbd5e1',
            }}
          >
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: '#93c5fd', textDecoration: 'underline' }}
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '0 0 8px 0' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
              }}
            >
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            style={{
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '6px 8px',
              textAlign: 'left',
              background: 'rgba(255, 255, 255, 0.04)',
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            style={{
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '6px 8px',
            }}
          >
            {children}
          </td>
        ),
        code: ({ children }) => {
          const text = extractTextContent(children).replace(/\n$/, '');
          return (
            <code
              style={{
                background: 'rgba(99,102,241,0.15)',
                padding: '1px 5px',
                borderRadius: '3px',
                fontSize: '12px',
                color: '#a5b4fc',
                fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              }}
            >
              {text}
            </code>
          );
        },
        pre: ({ children }) => {
          const childArray = Children.toArray(children);
          const firstChild = childArray[0];

          if (isValidElement<{ className?: string; children?: ReactNode }>(firstChild)) {
            const lang = firstChild.props.className?.match(/language-(\S+)/)?.[1] || '';
            const text = extractTextContent(firstChild.props.children ?? '').replace(/\n$/, '');
            return <CodeBlock lang={lang} code={text} />;
          }

          return <pre>{children}</pre>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
