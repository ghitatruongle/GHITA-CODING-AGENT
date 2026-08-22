// ==============================================================================
// GHITA CODING AGENT — Track 3 (v1.1.5-beta2): AST Symbol Outline Component
// ==============================================================================

import { memo, useEffect, useState, useMemo } from 'react';
import { parseSource, type CodeNode } from '@ghita/code-graph';

export interface SymbolOutlineProps {
  filePath?: string;
  content: string;
  language?: string;
  onSelectSymbol?: (line: number, column: number) => void;
}

const KIND_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  class: { icon: '🔷', color: '#60a5fa', label: 'Class' },
  interface: { icon: '🔶', color: '#fb923c', label: 'Interface' },
  function: { icon: '⚡', color: '#a78bfa', label: 'Function' },
  method: { icon: '🔹', color: '#38bdf8', label: 'Method' },
  type: { icon: '📐', color: '#34d399', label: 'Type' },
  enum: { icon: '📋', color: '#fbbf24', label: 'Enum' },
  variable: { icon: '▫️', color: '#94a3b8', label: 'Variable' },
  import: { icon: '📦', color: '#a855f7', label: 'Import' },
};

export const SymbolOutline = memo(function SymbolOutline({
  filePath = 'document.ts',
  content,
  onSelectSymbol,
}: SymbolOutlineProps) {
  const [symbols, setSymbols] = useState<CodeNode[]>([]);
  const [filterText, setFilterText] = useState('');
  const [expandedKinds, setExpandedKinds] = useState<Record<string, boolean>>({
    class: true,
    interface: true,
    function: true,
    type: true,
    variable: true,
    enum: true,
  });

  useEffect(() => {
    if (!content || !content.trim()) {
      setSymbols([]);
      return;
    }

    try {
      const parsed = parseSource(filePath, content, { forceJs: true });
      setSymbols(parsed.nodes.filter((n) => n.kind !== 'module'));
    } catch (e) {
      console.error('[SymbolOutline error]', e);
    }
  }, [filePath, content]);

  const filteredSymbols = useMemo(() => {
    if (!filterText) return symbols;
    const lower = filterText.toLowerCase();
    return symbols.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        (s.excerpt && s.excerpt.toLowerCase().includes(lower)),
    );
  }, [symbols, filterText]);

  const grouped = useMemo(() => {
    const map = new Map<string, CodeNode[]>();
    for (const sym of filteredSymbols) {
      const list = map.get(sym.kind) ?? [];
      list.push(sym);
      map.set(sym.kind, list);
    }
    return map;
  }, [filteredSymbols]);

  const toggleKind = (kind: string) => {
    setExpandedKinds((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  if (symbols.length === 0) {
    return (
      <div className="p-3 text-xs text-text-muted text-center italic">
        No symbols found in this file.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-xs font-sans select-none overflow-hidden">
      {/* Search Bar */}
      <div className="p-2 border-b border-border-subtle bg-bg-surface/50">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter symbols..."
          className="w-full px-2 py-1 text-xs rounded bg-bg-input border border-border-subtle text-text-primary focus:outline-none focus:border-accent-primary"
        />
      </div>

      {/* Symbol Tree */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
        {Array.from(grouped.entries()).map(([kind, nodes]) => {
          const kindMeta = KIND_ICONS[kind] ?? { icon: '•', color: '#cbd5e1', label: kind };
          const isExpanded = expandedKinds[kind] ?? true;

          return (
            <div key={kind} className="space-y-0.5">
              {/* Kind Header */}
              <button
                onClick={() => toggleKind(kind)}
                className="w-full flex items-center justify-between px-1.5 py-1 rounded hover:bg-bg-hover text-text-secondary font-semibold text-[11px] tracking-wide uppercase"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] text-text-muted transform transition-transform"
                    style={{
                      display: 'inline-block',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    ▶
                  </span>
                  <span>{kindMeta.icon}</span>
                  <span>{kindMeta.label}s</span>
                </div>
                <span className="text-[10px] text-text-muted px-1.5 py-0.2 bg-bg-surface rounded-full">
                  {nodes.length}
                </span>
              </button>

              {/* Items */}
              {isExpanded && (
                <div className="pl-4 space-y-0.5">
                  {nodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => {
                        if (node.startLine) {
                          onSelectSymbol?.(node.startLine, 1);
                        }
                      }}
                      className="w-full flex items-center justify-between px-2 py-1 rounded text-left hover:bg-accent-primary/10 hover:text-accent-primary text-text-primary group transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-xs font-medium truncate">{node.name}</span>
                        {node.excerpt && (
                          <span className="text-[10px] text-text-muted font-mono truncate hidden group-hover:inline">
                            {node.excerpt}
                          </span>
                        )}
                      </div>
                      {node.startLine && (
                        <span className="text-[10px] text-text-muted font-mono flex-shrink-0 ml-2">
                          :{node.startLine}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
