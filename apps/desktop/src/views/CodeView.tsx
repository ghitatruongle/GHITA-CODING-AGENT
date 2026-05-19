// ==============================================================================
// GHITA CODING AGENT — Code View
// ==============================================================================

import { useState, Suspense, lazy } from 'react';

const CodeEditor = lazy(() =>
  import('../components/CodeEditor').then((m) => ({ default: m.CodeEditor })),
);

const DEMO_CODE = `// GHITA CODING AGENT — Welcome!
// Phase 2: Desktop App đã sẵn sàng 🚀

interface Agent {
  name: string;
  role: 'coder' | 'reviewer' | 'researcher';
  skills: string[];
}

function createAgent(config: Partial<Agent>): Agent {
  return {
    name: config.name ?? 'Unnamed Agent',
    role: config.role ?? 'coder',
    skills: config.skills ?? ['file-manager', 'terminal'],
  };
}

const ghita = createAgent({
  name: 'GHITA',
  role: 'coder',
  skills: ['file-manager', 'browser-control', 'computer-use', 'terminal'],
});

console.log('Agent created:', ghita);
`;

export function CodeView() {
  const [code, setCode] = useState(DEMO_CODE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* File tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '36px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-subtle)',
          paddingLeft: '12px',
          gap: '2px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 14px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            background: 'var(--bg-secondary)',
            borderRadius: '6px 6px 0 0',
            borderTop: '2px solid var(--accent-primary)',
          }}
        >
          <span style={{ color: 'var(--info)' }}>TS</span>
          <span>welcome.ts</span>
          <button
            style={{
              fontSize: '14px',
              color: 'var(--text-muted)',
              marginLeft: '6px',
              lineHeight: 1,
            }}
            title="Close file"
          >
            ×
          </button>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Suspense
          fallback={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--accent-primary)',
              }}
            >
              ⚡ Loading editor...
            </div>
          }
        >
          <CodeEditor value={code} language="typescript" onChange={setCode} />
        </Suspense>
      </div>
    </div>
  );
}
