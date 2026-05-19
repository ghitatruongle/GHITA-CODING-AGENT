// ==============================================================================
// GHITA CODING AGENT — Terminal (xterm.js + Tauri Shell fallback)
// ==============================================================================

import { useEffect, useRef, useState } from 'react';

export function Terminal() {
  const termRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<string[]>([
    '\x1b[38;5;141m🤖 GHITA CODING AGENT Terminal\x1b[0m',
    '\x1b[38;5;245mType commands below. Terminal backend connects in Phase 5.\x1b[0m',
    '',
  ]);
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    if (!input.trim()) return;
    setHistory((prev) => [
      ...prev,
      `\x1b[38;5;83m❯\x1b[0m ${input}`,
      `\x1b[38;5;245m[mock] Command "${input}" — Tauri shell integration pending.\x1b[0m`,
      '',
    ]);
    setInput('');
  };

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [history]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0c0c18',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
      }}
    >
      {/* Output */}
      <div
        ref={termRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 16px',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {history.map((line, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }} />
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderTop: '1px solid var(--border-subtle)',
          gap: '8px',
        }}
      >
        <span style={{ color: 'var(--success)', fontWeight: 600 }}>❯</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="Nhập lệnh..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
          }}
          autoFocus
        />
      </div>
    </div>
  );
}

/** Simple ANSI escape code → HTML converter (basic colors) */
function ansiToHtml(text: string): string {
  const esc = String.fromCharCode(27);

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replaceAll(`${esc}[38;5;141m`, '<span style="color:#a78bfa">')
    .replaceAll(`${esc}[38;5;245m`, '<span style="color:#606080">')
    .replaceAll(`${esc}[38;5;83m`, '<span style="color:#22c55e">')
    .replaceAll(`${esc}[0m`, '</span>');
}
