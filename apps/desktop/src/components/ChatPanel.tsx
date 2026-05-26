// ==============================================================================
// GHITA CODING AGENT — Premium AI Chat Panel (Glassmorphism & Live Streaming)
// ==============================================================================

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { invoke } from '@tauri-apps/api/core';
import { generateUUID, type AgentEvent } from '@ghita/shared';
import { useAppStore } from '../stores/appStore';
import { useTranslation } from '../i18n';
import { loadApiConfig } from '../utils/apiConfig';
import { runCommand } from '../utils/shell';

// --- Types mirroring ApiManager storage schema ---
type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'custom'
  | 'opengateway'
  | 'mimo'
  | 'openrouter'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'hicap'
  | 'github-models'
  // Phase 1.2: New providers
  | 'cerebras'
  | 'together'
  | 'fireworks'
  | 'cohere'
  | 'xai'
  | 'replicate'
  | 'perplexity'
  | 'voyage'
  | 'ai21'
  | 'sambanova'
  | 'novita';

const PROVIDER_LABELS: Record<ProviderId, { name: string; icon: string }> = {
  openai:          { name: 'OpenAI',                icon: '🟢' },
  anthropic:       { name: 'Anthropic',             icon: '🟣' },
  google:          { name: 'Google Gemini',         icon: '🔵' },
  ollama:          { name: 'Ollama (Local)',         icon: '🦙' },
  custom:          { name: 'Custom Provider',       icon: '⚙️' },
  opengateway:     { name: 'Gitlawb Opengateway',   icon: '🌐' },
  mimo:            { name: 'Xiaomi MiMo',           icon: '🤖' },
  openrouter:      { name: 'OpenRouter',            icon: '🔀' },
  deepseek:        { name: 'DeepSeek',              icon: '🔍' },
  groq:            { name: 'Groq',                  icon: '⚡' },
  mistral:         { name: 'Mistral',               icon: '🌊' },
  hicap:           { name: 'Hicap',                 icon: '🔗' },
  'github-models': { name: 'GitHub Models',         icon: '🐙' },
  // Phase 1.2: New providers
  cerebras:        { name: 'Cerebras',              icon: '⚡' },
  together:        { name: 'Together AI',           icon: '🤝' },
  fireworks:       { name: 'Fireworks AI',          icon: '🎆' },
  cohere:          { name: 'Cohere',                icon: '🔷' },
  xai:             { name: 'xAI (Grok)',            icon: '❌' },
  replicate:       { name: 'Replicate',             icon: '🔁' },
  perplexity:      { name: 'Perplexity',            icon: '🔎' },
  voyage:          { name: 'Voyage AI',             icon: '🧭' },
  ai21:            { name: 'AI21 Labs',             icon: '🧪' },
  sambanova:       { name: 'SambaNova',             icon: '🔥' },
  novita:          { name: 'Novita AI',             icon: '🌟' },
};

interface DynamicModelOption {
  value: string;       // e.g. 'openai/gpt-4o'
  label: string;       // e.g. '🟢 OpenAI — gpt-4o'
  providerId: string;  // e.g. 'openai'
  model: string;       // e.g. 'gpt-4o'
}

/** Build flat model option list from persisted API config. */
function buildModelOptions(parsed: Record<string, Record<string, unknown>> = {}): DynamicModelOption[] {
  try {
    const options: DynamicModelOption[] = [];

    for (const [id, entry] of Object.entries(parsed)) {
      const pid = id as ProviderId;
      if (!entry) continue;

      // Provider must be active
      if (!entry['active']) continue;

      // Phase 1.1: Handle both old (apiKey) and new (apiKeys) formats
      const apiKeys = Array.isArray(entry['apiKeys'])
        ? (entry['apiKeys'] as string[])
        : typeof entry['apiKey'] === 'string' && entry['apiKey']
          ? [entry['apiKey'] as string]
          : [];

      // Non-ollama/opengateway providers must have a non-empty API key
      if (pid !== 'ollama' && pid !== 'opengateway' && apiKeys.length === 0) continue;

      const meta = PROVIDER_LABELS[pid] || { name: pid, icon: '🔷' };
      const availableModels = entry['availableModels'] as string[] | undefined;
      const selectedModel = entry['selectedModel'] as string | undefined;
      const models = availableModels && availableModels.length > 0
        ? availableModels
        : selectedModel
          ? [selectedModel]
          : [];

      for (const model of models) {
        options.push({
          value: `${pid}/${model}`,
          label: `${meta.icon} ${meta.name} — ${model}`,
          providerId: pid,
          model,
        });
      }
    }
    return options;
  } catch {
    return [];
  }
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  /** MCP tool call result embedded in message */
  mcpCard?: { tool: string; server: string; result: string; isError?: boolean };
  /** Web search results embedded in message */
  searchCard?: { query: string; results: Array<{ title: string; url: string; snippet: string }> };
  /** Attached image (base64) */
  imageAttachment?: string;
  /** Computer Use step preview details */
  computerUsePreview?: {
    screenshot: string;
    point?: { x: number; y: number };
    box?: { x1: number; y1: number; x2: number; y2: number };
  };
}

interface ToolApprovalRequest {
  toolCallId: string;
  name: string;
  arguments: string;
  warningMessage?: string;
}

interface ComputerUsePreviewProps {
  preview: {
    screenshot: string;
    point?: { x: number; y: number };
    box?: { x1: number; y1: number; x2: number; y2: number };
  };
}

function ComputerUsePreviewComponent({ preview }: ComputerUsePreviewProps) {
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

      {/* SVG Overlay for Vector Paths */}
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

        {/* Cursor path from screen center to target action point */}
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

        {/* Interactive path from center to current hover position */}
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

      {/* Responsive Crosshair Lines */}
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

      {/* Action Target Box */}
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

      {/* Action Target Point with pulsing sonar circle */}
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

      {/* Coordinate Tooltip Badge */}
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

      {/* Embedded Animation Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
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
      `}} />
    </div>
  );
}

/** Code block with Run button for executing commands */
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const { t } = useTranslation();

  // Determine if this code block is a runnable command
  const isShellCommand = !lang || lang === 'cmd' || lang === 'powershell' || lang === 'shell' || lang === 'bash' || lang === 'sh';
  // Single-line code blocks without language are likely commands
  const isRunnable = isShellCommand && code.split('\n').filter(l => l.trim()).length <= 3;

  const handleRun = async () => {
    const command = code.trim();
    if (!window.confirm(`Run this command?\n\n${command}`)) return;

    setIsRunning(true);
    setOutput(t('chat.runningCmd'));
    const result = await runCommand(command);
    if (result.success) {
      setOutput(result.stdout || t('chat.runSuccessNoOutput'));
    } else {
      setOutput(result.stderr || result.stdout || `(${t('chat.runError')}, exit code: ${result.code})`);
    }
    setIsRunning(false);
  };

  return (
    <div style={{
      margin: '8px 0', borderRadius: '6px',
      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 10px', fontSize: '10px', color: '#64748b',
        background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{lang || 'command'}</span>
        {isRunnable && (
          <button
            onClick={handleRun}
            disabled={isRunning}
            style={{
              background: isRunning ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.6)',
              color: '#fff', border: 'none', borderRadius: '4px',
              padding: '2px 10px', fontSize: '10px', cursor: isRunning ? 'default' : 'pointer',
              fontWeight: 600,
            }}
          >
            {isRunning ? `⏳ ${t('chat.runningCmd')}` : '▶ Run'}
          </button>
        )}
      </div>
      <pre style={{
        margin: 0, padding: '10px', fontSize: '12px', color: '#e2e8f0',
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'auto',
        maxHeight: '200px', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      }}>
        {code}
      </pre>
      {output && (
        <div style={{
          padding: '8px 10px', fontSize: '11px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.2)',
          color: output.includes(t('chat.runError')) || output.toLowerCase().includes('error') || output.includes('错误') ? '#f87171' : '#86efac',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          maxHeight: '120px', overflow: 'auto',
          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        }}>
          {output}
        </div>
      )}
    </div>
  );
}

/** Simple markdown to JSX renderer (bold, italic, code, code blocks, lists) */
function renderMarkdown(text: string): React.ReactNode {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    // Code block
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines = part.slice(3, -3).split('\n');
      const lang = lines[0]?.trim() || '';
      const code = lang ? lines.slice(1).join('\n') : lines.join('\n');
      return <CodeBlock key={i} lang={lang} code={code} />;
    }

    // Inline text — process bold, italic, inline code, lists
    const lines = part.split('\n');
    return lines.map((line, li) => {
      // List item
      if (/^\s*[-*+]\s/.test(line)) {
        const content = line.replace(/^\s*[-*+]\s/, '');
        return (
          <div key={`${i}-${li}`} style={{ display: 'flex', gap: '6px', margin: '2px 0' }}>
            <span style={{ color: '#818cf8', flexShrink: 0 }}>{'\u2022'}</span>
            <span>{renderInline(content)}</span>
          </div>
        );
      }
      // Numbered list
      if (/^\s*\d+\.\s/.test(line)) {
        const num = line.match(/^\s*(\d+)\./)?.[1] || '1';
        const content = line.replace(/^\s*\d+\.\s/, '');
        return (
          <div key={`${i}-${li}`} style={{ display: 'flex', gap: '6px', margin: '2px 0' }}>
            <span style={{ color: '#818cf8', flexShrink: 0, minWidth: '14px' }}>{num}.</span>
            <span>{renderInline(content)}</span>
          </div>
        );
      }
      return <span key={`${i}-${li}`}>{li > 0 && <br />}{renderInline(line)}</span>;
    });
  });
}

/** Render inline markdown (bold, italic, inline code) */
function renderInline(text: string): React.ReactNode {
  // Split by inline code, bold, italic patterns
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(regex);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`')) {
      return <code key={i} style={{
        background: 'rgba(99,102,241,0.15)', padding: '1px 5px',
        borderRadius: '3px', fontSize: '12px', color: '#a5b4fc',
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      }}>{p.slice(1, -1)}</code>;
    }
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('*') && p.endsWith('*')) {
      return <em key={i} style={{ color: '#cbd5e1', fontStyle: 'italic' }}>{p.slice(1, -1)}</em>;
    }
    return p;
  });
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
}

export function ChatPanel() {
  const { t, lang } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const INITIAL_MESSAGES: ChatMessage[] = [];

  // Sessions and History state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [currentView, setCurrentView] = useState<'chat' | 'history'>('chat');
  const isSwitchingSessionRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const terminalCwd = useAppStore((s) => s.terminalCwd);

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ghita_chat_sessions');
      if (raw) {
        const parsed = JSON.parse(raw) as ChatSession[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          const lastActiveId = localStorage.getItem('ghita_active_session_id');
          const hasLastActive = parsed.some(s => s.id === lastActiveId);
          const activeId = hasLastActive ? lastActiveId! : parsed[0]!.id;
          setActiveSessionId(activeId);
          const activeSess = parsed.find(s => s.id === activeId);
          if (activeSess) {
            setMessages(activeSess.messages);
          }
          return;
        }
      }
    } catch (e) {
      console.error('[ChatPanel] Failed to load chat sessions:', e);
    }

    // Default session creation
    const defaultId = generateUUID();
    const defaultSession: ChatSession = {
      id: defaultId,
      title: t('chat.newChat') || 'Cuộc trò chuyện mới',
      messages: INITIAL_MESSAGES,
      timestamp: Date.now(),
    };
    setSessions([defaultSession]);
    setActiveSessionId(defaultId);
    setMessages(INITIAL_MESSAGES);
    try {
      localStorage.setItem('ghita_chat_sessions', JSON.stringify([defaultSession]));
      localStorage.setItem('ghita_active_session_id', defaultId);
    } catch (e) {}
  }, []);

  // Update localStorage and sessions list whenever messages change
  useEffect(() => {
    if (!activeSessionId || sessions.length === 0 || isSwitchingSessionRef.current) return;

    setSessions((prevSessions) => {
      const updated = prevSessions.map((s) => {
        if (s.id === activeSessionId) {
          let newTitle = s.title;
          const defaultTitles = [
            'Cuộc trò chuyện mới',
            'New Chat',
            '新聊天',
            t('chat.newChat'),
            'Cuộc trò chuyện mới'.toLowerCase(),
            'New Chat'.toLowerCase(),
            '新聊天'.toLowerCase()
          ];
          const isDefaultTitle = defaultTitles.some(dt => dt === s.title || dt === s.title.trim());

          if (isDefaultTitle) {
            const firstUserMsg = messages.find(m => m.role === 'user');
            if (firstUserMsg && firstUserMsg.content.trim()) {
              newTitle = firstUserMsg.content.trim().substring(0, 25);
              if (firstUserMsg.content.trim().length > 25) {
                newTitle += '...';
              }
            }
          }

          return {
            ...s,
            messages,
            title: newTitle,
            timestamp: Date.now(),
          };
        }
        return s;
      });

      const sorted = [...updated].sort((a, b) => b.timestamp - a.timestamp);
      try {
        localStorage.setItem('ghita_chat_sessions', JSON.stringify(sorted));
      } catch (e) {}
      return sorted;
    });
  }, [messages, activeSessionId]);

  const handleSelectSession = (sessionId: string) => {
    const target = sessions.find(s => s.id === sessionId);
    if (!target) return;

    isSwitchingSessionRef.current = true;
    setActiveSessionId(sessionId);
    setMessages(target.messages);
    localStorage.setItem('ghita_active_session_id', sessionId);
    setCurrentView('chat');

    setTimeout(() => {
      isSwitchingSessionRef.current = false;
    }, 50);
  };

  const handleCreateSession = () => {
    const newId = generateUUID();
    const newSession: ChatSession = {
      id: newId,
      title: t('chat.newChat') || 'Cuộc trò chuyện mới',
      messages: INITIAL_MESSAGES,
      timestamp: Date.now(),
    };

    isSwitchingSessionRef.current = true;
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
    setMessages(INITIAL_MESSAGES);
    localStorage.setItem('ghita_active_session_id', newId);
    setCurrentView('chat');

    setTimeout(() => {
      isSwitchingSessionRef.current = false;
    }, 50);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const updated = sessions.filter(s => s.id !== sessionId);
    setSessions(updated);

    try {
      localStorage.setItem('ghita_chat_sessions', JSON.stringify(updated));
    } catch (err) {}

    if (activeSessionId === sessionId) {
      if (updated.length > 0) {
        handleSelectSession(updated[0]!.id);
      } else {
        const newId = generateUUID();
        const defaultSession: ChatSession = {
          id: newId,
          title: t('chat.newChat') || 'Cuộc trò chuyện mới',
          messages: INITIAL_MESSAGES,
          timestamp: Date.now(),
        };
        setSessions([defaultSession]);
        setActiveSessionId(newId);
        setMessages(INITIAL_MESSAGES);
        localStorage.setItem('ghita_chat_sessions', JSON.stringify([defaultSession]));
        localStorage.setItem('ghita_active_session_id', newId);
        setCurrentView('chat');
      }
    }
  };

  const handleReconnect = async () => {
    if (connectionStatus === 'connected') return;
    setConnectionStatus('connecting');
    try {
      console.log('[ChatPanel] Manual reconnect triggered, starting sidecar server...');
      await invoke('start_server');
      // Wait 1.5 seconds for server to start
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setReconnectTrigger((prev) => prev + 1);
    } catch (e) {
      console.error('[ChatPanel] Manual reconnect failed:', e);
      setConnectionStatus('disconnected');
    }
  };

  // Phase 3: Live Event Stream
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);

  // Dynamic model list — loaded from localStorage API keys
  const [modelOptions, setModelOptions] = useState<DynamicModelOption[]>([]);
  const [provider, setProvider] = useState<string>(() => {
    return '';
  });
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-model-dropdown]')) {
        setModelDropdownOpen(false);
        setModelSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelDropdownOpen]);

  // Sync model options when the API Manager updates persisted provider config.
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const newOptions = buildModelOptions(await loadApiConfig());
      if (disposed) return;
      setModelOptions(newOptions);
      // If current selection is no longer valid, reset to first available
      if (newOptions.length > 0 && !newOptions.some((o) => o.value === provider)) {
        setProvider(newOptions[0]!.value);
      } else if (newOptions.length === 0 && provider) {
        setProvider('');
      }
    };

    void refresh();

    // Poll because the API Manager persists through Tauri commands, not browser storage events.
    const interval = setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [provider]);

  // Tool approval state (Human-in-the-loop)
  const [approvalRequest, setApprovalRequest] = useState<ToolApprovalRequest | null>(null);

  const [agentRole, setAgentRole] = useState<'Explore' | 'Plan' | 'UI' | 'default'>('default');
  const [ralphMode, setRalphMode] = useState<boolean>(false);

  // Phase 6B: Context usage
  const [contextUsage] = useState<{ used: number; max: number; percentage: number }>({ used: 0, max: 128000, percentage: 0 });

  // Phase 6A: Slash command autocomplete
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashCommands] = useState<Array<{ trigger: string; name: string; description: string }>>([
    { trigger: '/compact', name: 'Compact Context', description: t('chat.compactContext') },
    { trigger: '/clear', name: 'Clear Chat', description: t('chat.clearChat') },
    { trigger: '/help', name: 'Help', description: t('chat.help') },
    { trigger: '/code-review', name: 'Code Review', description: t('chat.codeReview') },
    { trigger: '/feature-dev', name: 'Feature Dev', description: t('chat.featureDev') },
    { trigger: '/deploy-check', name: 'Deploy Check', description: t('chat.deployCheck') },
    { trigger: '/grill-me', name: 'Grill Me', description: 'Socratic docs-aware design interview' },
  ]);
  const [filteredSlashCmds, setFilteredSlashCmds] = useState<typeof slashCommands>([]);

  // Phase 6C: Image attachment
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ralphProgress, setRalphProgress] = useState<{
    iteration: number;
    cost: number;
    message: string;
    code?: string;
  } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Connect to Socket.io Server Sidecar
  useEffect(() => {
    let active = true;

    const initSocket = async () => {
      try {
        // Get active port from Tauri Server State
        const status = await invoke<{ port: number }>('get_server_status');
        const port = status.port || 8080;

        if (!active) return;

        setConnectionStatus('connecting');
        const socket = io(`http://127.0.0.1:${port}`, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          if (active) setConnectionStatus('connected');
          console.log('[ChatPanel] Connected to sidecar Socket.io server.');
        });

        socket.on('disconnect', () => {
          if (active) setConnectionStatus('disconnected');
        });

        socket.on('connect_error', (err) => {
          console.warn('[ChatPanel] Socket connection error:', err);
          if (active) setConnectionStatus('disconnected');
        });

        // AI Streaming Event Listeners
        socket.on('chat_start', (data: { text: string; senderId: string; senderName: string }) => {
          if (!active) return;
          setIsSending(true);
          
          // If message is from another device, insert the user's message
          if (data.senderId !== 'desktop') {
            setMessages((prev) => [
              ...prev,
              {
                id: generateUUID(),
                role: 'user',
                content: data.text,
                timestamp: Date.now(),
              }
            ]);
          }

          // Create placeholder for AI response
          setMessages((prev) => [
            ...prev,
            {
              id: 'streaming-message',
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
            }
          ]);
        });

        socket.on('chat_chunk', (data: { text: string }) => {
          if (!active) return;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === 'streaming-message'
                ? { ...msg, content: msg.content + data.text }
                : msg
            )
          );
        });

        socket.on('chat_done', (data: { text: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }) => {
          if (!active) return;
          const finalId = generateUUID();
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === 'streaming-message'
                ? { id: finalId, role: 'assistant', content: data.text, timestamp: Date.now() }
                : msg
            )
          );
          setIsSending(false);

          /*
          // Auto-execute shell commands from AI response
          const cmdRegex = /```(?:cmd|powershell|shell|bash|sh)?\s*\n?([\s\S]*?)```/g;
          const commands: string[] = [];
          let match;
          while ((match = cmdRegex.exec(data.text)) !== null) {
            const cmd = match[1].trim();
            if (cmd && cmd.split('\n').filter(l => l.trim()).length <= 3) {
              commands.push(cmd);
            }
          }
          if (commands.length > 0) {
            (async () => {
              for (const cmd of commands) {
                setMessages((prev) => [
                  ...prev,
                  { id: generateUUID(), role: 'assistant', content: `⚡ Đang chạy: \`${cmd}\``, timestamp: Date.now() },
                ]);
                const result = await runCommand(cmd);
                const output = result.success
                  ? (result.stdout || '✔ Thành công')
                  : `❌ ${result.stderr || result.stdout || 'Lỗi'}`;
                setMessages((prev) => [
                  ...prev,
                  { id: generateUUID(), role: 'assistant', content: `\`\`\`\n${output}\n\`\`\``, timestamp: Date.now() },
                ]);
              }
            })();
          }

          */
          // Update dashboard stats with real usage data
          if (data.usage) {
            const currentStats = useAppStore.getState().dashboardStats;
            useAppStore.getState().setDashboardStats({
              totalTokens: currentStats.totalTokens + data.usage.totalTokens,
              totalCost: currentStats.totalCost + (data.usage.totalTokens * 0.000002),
              activeAgents: currentStats.activeAgents,
              mcpConnections: currentStats.mcpConnections,
            });
            // Update context usage
            const used = data.usage.totalTokens;
            const max = 128000;
            useAppStore.getState().setContextUsage({
              used: Math.min(used, max),
              max,
              percentage: Math.round((used / max) * 100),
            });
          }
        });

        socket.on('chat_error', (data: { message: string }) => {
          if (!active) return;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === 'streaming-message'
                ? { id: generateUUID(), role: 'assistant', content: `❌ **${tRef.current('chat.systemError')}** ${data.message}`, timestamp: Date.now() }
                : msg
            )
          );
          setIsSending(false);
        });

        // Human-in-the-loop: Request tool execution approval
        socket.on('action_required', (data: ToolApprovalRequest) => {
          if (active) {
            setApprovalRequest(data);
          }
        });

        // Phase 3: Listen to live agent runtime events
        socket.on('agent_event', (event: AgentEvent) => {
          if (active) {
            setAgentEvents((prev) => {
              const next = [...prev, event];
              // Keep last 15 events
              if (next.length > 15) next.shift();
              return next;
            });

            // If a skill is auto-created or learned, push a premium info message
            if (event.type === 'skill:learning') {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateUUID(),
                  role: 'assistant',
                  content: `⚡ **${tRef.current('chat.skillLearned')}**\n\n**${event.payload?.name || 'Unnamed Skill'}**\n*${tRef.current('chat.description')}:* ${event.payload?.description || ''}\n\n${tRef.current('chat.skillSaved')}`,
                  timestamp: Date.now(),
                }
              ]);
            }
          }
        });

        socket.on('ralph_loop_progress', (data: any) => {
          if (active) {
            setRalphProgress(data);
          }
        });

        socket.on('ralph_loop_done', () => {
          if (active) {
            setRalphProgress(null);
          }
        });

        socket.on('computer_use_step', (data: {
          action?: string;
          screenshot: string;
          point?: { x: number; y: number };
          box?: { x1: number; y1: number; x2: number; y2: number };
        }) => {
          if (active) {
            setMessages((prev) => [
              ...prev,
              {
                id: generateUUID(),
                role: 'assistant',
                content: data.action ? `🤖 **[Computer Action]** ${data.action}` : `🤖 **[Computer Action]** ${tRef.current('chat.runningAutomation')}`,
                timestamp: Date.now(),
                computerUsePreview: {
                  screenshot: data.screenshot,
                  point: data.point,
                  box: data.box,
                },
              },
            ]);
          }
        });

      } catch (err) {
        console.error('[ChatPanel] Socket initialization failed:', err);
        if (active) setConnectionStatus('disconnected');
      }
    };

    initSocket();

    // Fetch config file mapping if possible
    const loadConfigMapping = async () => {
      try {
        // We will query config files in Phase 3
      } catch (e) {}
    };
    loadConfigMapping();

    return () => {
      active = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [reconnectTrigger]);

  // Phase 6A: Handle slash command input
  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.startsWith('/')) {
      const filtered = slashCommands.filter((c) => c.trigger.startsWith(value));
      setFilteredSlashCmds(filtered);
      setShowSlashMenu(filtered.length > 0 && value.length > 0);
    } else {
      setShowSlashMenu(false);
    }
  };

  // Phase 6C: Handle image paste
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            setAttachedImage(reader.result as string);
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  // Phase 6C: Handle image drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachedImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    if (input.trim() === '/clear') {
      setMessages(INITIAL_MESSAGES);
      setInput('');
      setShowSlashMenu(false);
      return;
    }

    // Guard: nếu chưa kết nối socket thì hiển thị hướng dẫn
    if (!socketRef.current || connectionStatus !== 'connected') {
      setMessages((prev) => [
        ...prev,
        {
          id: generateUUID(),
          role: 'user',
          content: input,
          timestamp: Date.now(),
        },
        {
          id: generateUUID(),
          role: 'assistant',
          content: `⚠️ **${t('chat.notConnected')}**\n\n${t('chat.notConnectedHint')}`,
          timestamp: Date.now(),
        },
      ]);
      setInput('');
      return;
    }

    // Guard: nếu chưa cấu hình API Key thì hiển thị hướng dẫn thay vì gửi lên server
    if (modelOptions.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateUUID(),
          role: 'user',
          content: input,
          timestamp: Date.now(),
        },
        {
          id: generateUUID(),
          role: 'assistant',
          content: `⚙️ **${t('chat.noProvider')}**\n\n${t('chat.noProviderHint')}`,
          timestamp: Date.now(),
        },
      ]);
      setInput('');
      return;
    }

    const userMsg: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      ...(attachedImage ? { imageAttachment: attachedImage } : {}),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    if (ralphMode) {
      // Chạy luồng Ralph Loop tự động sửa sai
      socketRef.current.emit('ralph_loop_run', {
        task: input,
        maxIterations: 3,
        costLimitUsd: 0.15,
      });
    } else {
      // Build chat history for context
      const projectContext = terminalCwd
        ? `\n\nThe user's current working directory is: ${terminalCwd}. This is where the user is working. When the user asks "what project am I working on", tell them this path and extract the project name from it. The last folder in the path is typically the project name.`
        : '';
      const safeSystemPrompt = [
        'You are GHITA Assistant, an AI coding assistant inside the GHITA CODING AGENT desktop app.',
        'You may suggest shell commands in fenced code blocks, but the app will not run them automatically.',
        'Ask for explicit user confirmation before commands that modify files, install packages, delete data, access secrets, or change system state.',
        'Answer concisely and directly.',
      ].join('\n\n');
      const history = [
        { role: 'system' as const, content: safeSystemPrompt + projectContext },
        ...messages
          .filter((msg) => msg.id !== 'streaming-message')
          .slice(-10) // Limit to last 10 messages for token context
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
      ];

      // Split 'providerId/modelName' from the select value
      const slashIdx = provider.indexOf('/');
      const selectedProvider = slashIdx > 0 ? provider.substring(0, slashIdx) : provider;
      const selectedModel = slashIdx > 0 ? provider.substring(slashIdx + 1) : undefined;

      // Read full provider credentials from localStorage to send to server
      let providerApiKey: string | undefined;
      let providerApiKeys: string[] | undefined;
      let providerBaseUrl: string | undefined;
      try {
        const parsed = await loadApiConfig();
        const entry = parsed[selectedProvider];
        if (entry) {
          // Phase 1.1: Handle both old and new formats
          const apiKeys = Array.isArray(entry['apiKeys'])
            ? (entry['apiKeys'] as string[])
            : typeof entry['apiKey'] === 'string' && entry['apiKey']
              ? [entry['apiKey'] as string]
              : [];
          providerApiKey = apiKeys[0] || undefined;
          providerApiKeys = apiKeys.length > 0 ? apiKeys : undefined;
          providerBaseUrl = (entry['baseUrl'] as string) || undefined;
        }
      } catch {
        // ignore
      }

      // Emit event through Socket.io to trigger AI Engine
      socketRef.current.emit('chat', {
        text: input,
        isDesktop: true,
        provider: selectedProvider,
        model: selectedModel,
        agentRole: agentRole,
        history: [...history, { role: 'user', content: input }],
        apiKey: providerApiKey,
        apiKeys: providerApiKeys,
        baseUrl: providerBaseUrl,
      });
    }

    setInput('');
    setAttachedImage(null);
    setShowSlashMenu(false);
  };

  const handleApproveTool = () => {
    if (!approvalRequest || !socketRef.current) return;
    socketRef.current.emit('approve', { toolCallId: approvalRequest.toolCallId });
    setApprovalRequest(null);
  };

  const handleRejectTool = (reason: string = 'User rejected execution') => {
    if (!approvalRequest || !socketRef.current) return;
    socketRef.current.emit('reject', { toolCallId: approvalRequest.toolCallId, reason });
    setApprovalRequest(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.05)',
        color: '#f8fafc',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(30, 41, 59, 0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>💬</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.5px',
              background: 'linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {t('chat.openclawEngine')}
          </span>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: connectionStatus === 'connected' ? '#10b981' : '#f59e0b',
              boxShadow: connectionStatus === 'connected' ? '0 0 8px #10b981' : 'none',
              marginLeft: '4px',
            }}
            title={connectionStatus === 'connected' ? 'Connected' : 'Offline'}
          />
          {connectionStatus !== 'connected' && (
            <button
              onClick={handleReconnect}
              disabled={connectionStatus === 'connecting'}
              style={{
                marginLeft: '8px',
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: 600,
                backgroundColor: connectionStatus === 'connecting' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(245, 158, 11, 0.15)',
                border: connectionStatus === 'connecting' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '4px',
                color: connectionStatus === 'connecting' ? '#94a3b8' : '#f59e0b',
                cursor: connectionStatus === 'connecting' ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (connectionStatus !== 'connecting') {
                  e.currentTarget.style.backgroundColor = 'rgba(245, 158, 11, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (connectionStatus !== 'connecting') {
                  e.currentTarget.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                }
              }}
            >
              {connectionStatus === 'connecting' ? t('chat.connecting') : t('chat.reconnect')}
            </button>
          )}

          {/* Session History & New Session Buttons */}
          <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
            <button
              onClick={() => setCurrentView(v => v === 'chat' ? 'history' : 'chat')}
              title={t('chat.chatHistory')}
              style={{
                background: currentView === 'history' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '12px',
                color: currentView === 'history' ? '#a5b4fc' : '#94a3b8',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              📂
            </button>
            <button
              onClick={handleCreateSession}
              title={t('chat.newChat')}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#94a3b8',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              ➕
            </button>
          </div>
        </div>

        {/* Model Selector - Custom Searchable Dropdown */}
        <div style={{ position: 'relative' }} data-model-dropdown>
          <button
            onClick={() => {
              if (modelOptions.length > 0) {
                setModelDropdownOpen(!modelDropdownOpen);
                setModelSearch('');
              }
            }}
            style={{
              padding: '4px 10px', fontSize: '11px',
              background: 'rgba(15, 23, 42, 0.6)',
              border: modelOptions.length === 0
                ? '1px solid rgba(239, 68, 68, 0.3)'
                : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: modelOptions.length === 0 ? '#f87171' : '#cbd5e1',
              cursor: modelOptions.length === 0 ? 'not-allowed' : 'pointer',
              maxWidth: '220px', display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'border 0.2s',
            }}
          >
            {modelOptions.length === 0
              ? `⚠️ ${t('chat.noConfig')}`
              : (modelOptions.find((o) => o.value === provider)?.label || provider)}
            <span style={{ fontSize: '8px', marginLeft: '2px', transform: modelDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>

          {modelDropdownOpen && modelOptions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              width: '280px', maxHeight: '320px',
              background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px', zIndex: 1000, overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}>
              {/* Search input */}
              <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <input
                  autoFocus
                  type="text"
                  placeholder={t('chat.searchModel')}
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '6px 10px', fontSize: '12px',
                    background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px', color: '#e2e8f0', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Grouped model list */}
              <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '4px' }}>
                {(() => {
                  const q = modelSearch.toLowerCase().trim();
                  const filtered = q
                    ? modelOptions.filter((o) => o.label.toLowerCase().includes(q) || o.model.toLowerCase().includes(q))
                    : modelOptions;

                  // Group by providerId
                  const groups = new Map<string, DynamicModelOption[]>();
                  for (const opt of filtered) {
                    if (!groups.has(opt.providerId)) groups.set(opt.providerId, []);
                    groups.get(opt.providerId)!.push(opt);
                  }

                  return [...groups.entries()].map(([pid, opts]) => {
                    const meta = PROVIDER_LABELS[pid as ProviderId] || { name: pid, icon: '\uD83D\uDD37' };
                    return (
                      <div key={pid}>
                        <div style={{
                          fontSize: '10px', fontWeight: 700, color: '#64748b',
                          padding: '6px 8px 2px', textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                          {meta.icon} {meta.name}
                        </div>
                        {opts.map((opt) => (
                          <div
                            key={opt.value}
                            onClick={() => { setProvider(opt.value); setModelDropdownOpen(false); setModelSearch(''); }}
                            style={{
                              padding: '6px 10px', fontSize: '12px', color: '#e2e8f0',
                              cursor: 'pointer', borderRadius: '4px',
                              background: opt.value === provider ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                              borderLeft: opt.value === provider ? '2px solid #818cf8' : '2px solid transparent',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => { if (opt.value !== provider) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                            onMouseLeave={(e) => { if (opt.value !== provider) e.currentTarget.style.background = 'transparent'; }}
                          >
                            {opt.model}
                          </div>
                        ))}
                      </div>
                    );
                  });
                })()}
                {modelSearch && modelOptions.filter((o) =>
                  o.label.toLowerCase().includes(modelSearch.toLowerCase()) || o.model.toLowerCase().includes(modelSearch.toLowerCase())
                ).length === 0 && (
                  <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                    {t('chat.noModelFound')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {currentView === 'history' ? (
        /* History View */
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
          className="custom-scrollbar"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {t('chat.chatHistory')}
            </span>
            <button
              onClick={handleCreateSession}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(79, 70, 229, 0.2) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '6px',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(79, 70, 229, 0.3) 100%)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(79, 70, 229, 0.2) 100%)'; }}
            >
              ➕ {t('chat.newChat')}
            </button>
          </div>

          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '40px 0' }}>
              {t('chat.noHistory')}
            </div>
          ) : (
            sessions.map((sess) => (
              <div
                key={sess.id}
                onClick={() => handleSelectSession(sess.id)}
                style={{
                  padding: '12px 14px',
                  background: sess.id === activeSessionId ? 'rgba(99, 102, 241, 0.12)' : 'rgba(30, 41, 59, 0.4)',
                  border: sess.id === activeSessionId ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.2s',
                  boxShadow: sess.id === activeSessionId ? '0 4px 20px rgba(99, 102, 241, 0.08)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (sess.id !== activeSessionId) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (sess.id !== activeSessionId) {
                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                  }
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: sess.id === activeSessionId ? '#fff' : '#cbd5e1',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sess.title}
                  </span>
                  <span style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.5)' }}>
                    {new Date(sess.timestamp).toLocaleString(
                      lang === 'vi' ? 'vi-VN' : lang === 'zh' ? 'zh-CN' : 'en-US',
                      {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    )}
                    <span style={{ margin: '0 6px' }}>•</span>
                    {t('chat.messagesCount', { count: sess.messages.filter(m => m.id !== 'streaming-message').length })}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(sess.id, e)}
                  title={t('chat.deleteChat')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#f87171';
                    e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#64748b';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Chat View */
        <>
          {/* Messages Window */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            className="custom-scrollbar"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  animation: 'fadeInUp 0.3s ease',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius:
                      msg.role === 'user'
                        ? '16px 16px 4px 16px'
                        : '16px 16px 16px 4px',
                    background:
                      msg.role === 'user'
                        ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(79, 70, 229, 0.2) 100%)'
                        : 'rgba(30, 41, 59, 0.65)',
                    border:
                      msg.role === 'user'
                        ? '1px solid rgba(99, 102, 241, 0.3)'
                        : '1px solid rgba(255, 255, 255, 0.05)',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    boxShadow: msg.role === 'user' ? '0 4px 14px rgba(99, 102, 241, 0.1)' : 'none',
                  }}
                >
                  {/* Markdown rendered content */}
                  {renderMarkdown(msg.content)}
                  
                  {/* Phase 6C: Image attachment display */}
                  {msg.imageAttachment && (
                    <img
                      src={msg.imageAttachment}
                      alt="Attached"
                      style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  )}

                  {/* Computer Use Step Preview with pulsing highlights */}
                  {msg.computerUsePreview && (
                    <ComputerUsePreviewComponent preview={msg.computerUsePreview} />
                  )}

                  {/* Phase 5A: MCP Tool Card */}
                  {msg.mcpCard && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '10px 12px',
                        background: msg.mcpCard.isError ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
                        border: `1px solid ${msg.mcpCard.isError ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)'}`,
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: msg.mcpCard.isError ? '#f87171' : '#a5b4fc', marginBottom: '4px' }}>
                        🔌 MCP: {msg.mcpCard.tool}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>
                        Server: {msg.mcpCard.server}
                      </div>
                      <pre style={{ margin: 0, color: '#cbd5e1', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '100px', overflow: 'auto' }}>
                        {msg.mcpCard.result}
                      </pre>
                    </div>
                  )}

                  {/* Phase 5C: Web Search Card */}
                  {msg.searchCard && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '10px 12px',
                        background: 'rgba(59,130,246,0.1)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: '6px' }}>
                        🌐 Search: {msg.searchCard.query}
                      </div>
                      {msg.searchCard.results.map((r, i) => (
                        <div key={i} style={{ marginBottom: '6px', paddingLeft: '8px', borderLeft: '2px solid rgba(59,130,246,0.3)' }}>
                          <div style={{ fontWeight: 600, color: '#93c5fd' }}>{r.title}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{r.snippet.substring(0, 100)}...</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.isStreaming && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '3px',
                        height: '13px',
                        backgroundColor: '#818cf8',
                        marginLeft: '4px',
                        animation: 'blink 0.8s infinite',
                        verticalAlign: 'middle',
                      }}
                    />
                  )}
                </div>
                <span style={{
                  fontSize: '10px', color: 'rgba(148, 163, 184, 0.6)',
                  marginTop: '4px', padding: '0 4px', display: 'flex', gap: '8px', alignItems: 'center',
                }}>
                  <span>{new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ opacity: 0.5 }}>
                    ~{Math.ceil(msg.content.length / 4)} tok
                  </span>
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Live Agent Activity Timeline */}
          {agentEvents.length > 0 && (
            <div
              style={{
                margin: '0 16px 12px 16px',
                padding: '12px',
                background: 'rgba(30, 41, 59, 0.45)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: '12px',
                backdropFilter: 'blur(16px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '140px',
                overflowY: 'auto',
                animation: 'fadeInUp 0.3s ease',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
              }}
            >
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes pulsePurple {
                  0% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0.7); }
                  70% { box-shadow: 0 0 0 6px rgba(192, 132, 252, 0); }
                  100% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0); }
                }
                .pulse-indicator-purple {
                  animation: pulsePurple 2s infinite;
                }
              `}} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.5px' }}>
                  <span className="pulse-indicator-purple" style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#c084fc',
                    display: 'inline-block',
                  }} />
                  LIVE AGENT EVENTS
                </span>
                <button
                  onClick={() => setAgentEvents([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    cursor: 'pointer',
                    opacity: 0.7,
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                >
                  Clear
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '8px' }}>
                {agentEvents.map((evt) => {
                  let icon = 'ℹ️';
                  let color = '#cbd5e1';
                  let label: string = evt.type;
                  
                  switch (evt.type) {
                    case 'agent:thinking':
                      icon = '🧠';
                      color = '#c084fc';
                      label = 'Thinking';
                      break;
                    case 'agent:state':
                      icon = '🤖';
                      color = '#38bdf8';
                      label = 'State';
                      break;
                    case 'tool:run':
                      icon = '⚙️';
                      color = '#f472b6';
                      label = `Running Tool: ${evt.payload?.name || ''}`;
                      break;
                    case 'tool:complete':
                      icon = '✅';
                      color = '#34d399';
                      label = `Completed Tool: ${evt.payload?.name || ''}`;
                      break;
                    case 'tool:error':
                      icon = '❌';
                      color = '#f87171';
                      label = `Tool Error: ${evt.payload?.name || ''}`;
                      break;
                    case 'skill:learning':
                      icon = '⚡';
                      color = '#fbbf24';
                      label = 'Skill Learning';
                      break;
                    case 'memory:update':
                      icon = '💾';
                      color = '#22d3ee';
                      label = 'Memory Update';
                      break;
                  }

                  return (
                    <div
                      key={evt.id}
                      style={{
                        display: 'flex',
                        gap: '10px',
                        fontSize: '12px',
                        color,
                        alignItems: 'flex-start',
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.03)',
                      }}
                    >
                      <span style={{ fontSize: '13px' }}>{icon}</span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ fontWeight: 600 }}>{evt.message || label}</div>
                        {evt.payload && typeof evt.payload === 'object' && Object.keys(evt.payload).length > 0 && evt.type !== 'skill:learning' && (
                          <pre
                            style={{
                              margin: 0,
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              background: 'rgba(0,0,0,0.15)',
                              padding: '4px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {JSON.stringify(evt.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', opacity: 0.6, marginTop: '2px' }}>
                        {new Date(evt.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Compact Status & Advanced Toggle Bar */}
          <div
            style={{
              padding: '6px 14px',
              background: 'rgba(30, 41, 59, 0.35)',
              backdropFilter: 'blur(10px)',
              borderTop: '1px solid rgba(255, 255, 255, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            {/* Left: Context + Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px', color: 'rgba(148, 163, 184, 0.6)' }}>
              <span>Context: {contextUsage.used.toLocaleString()} / {contextUsage.max.toLocaleString()}</span>
              <div style={{ width: '40px', height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, contextUsage.percentage)}%`, background: contextUsage.percentage > 80 ? '#f87171' : '#818cf8', borderRadius: '2px' }} />
              </div>
              {ralphMode && (
                <span style={{ color: '#34d399', fontWeight: 600, fontSize: '10px' }}>🔄 RALPH</span>
              )}
            </div>

            {/* Right: Toggle Advanced */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: 600,
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                background: showAdvanced ? 'rgba(99, 102, 241, 0.15)' : 'rgba(15, 23, 42, 0.4)',
                color: showAdvanced ? '#a5b4fc' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{showAdvanced ? '▾' : '▸'}</span>
              <span>{t('chat.advanced')}</span>
            </button>
          </div>

          {/* Advanced Controls Panel (collapsible) */}
          {showAdvanced && (
            <div
              style={{
                padding: '8px 14px',
                background: 'rgba(15, 23, 42, 0.4)',
                borderTop: '1px solid rgba(255, 255, 255, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                animation: 'fadeInUp 0.2s ease',
              }}
            >
              {/* Row 1: Agent Router */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '72px' }}>
                  {t('chat.agentRole')}
                </span>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {(['default', 'Explore', 'Plan', 'UI'] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => setAgentRole(role)}
                      style={{
                        padding: '3px 7px',
                        fontSize: '10px',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: '1px solid ' + (agentRole === role ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.05)'),
                        background: agentRole === role ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                        color: agentRole === role ? '#a5b4fc' : '#94a3b8',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Ralph Loop + Workflow shortcuts */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '72px' }}>
                  {t('chat.workflows')}
                </span>
                <button
                  onClick={() => setRalphMode(!ralphMode)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid ' + (ralphMode ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.06)'),
                    background: ralphMode
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)'
                      : 'transparent',
                    color: ralphMode ? '#34d399' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  🔄 Ralph {ralphMode ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setInput('/code-review ')}
                  style={{
                    padding: '3px 7px',
                    fontSize: '10px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    background: 'transparent',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  🕵️ Review
                </button>
                <button
                  onClick={() => setInput('/feature-dev ')}
                  style={{
                    padding: '3px 7px',
                    fontSize: '10px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    background: 'transparent',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Feature
                </button>
              </div>
            </div>
          )}

          {/* Ralph Loop Active Dashboard Card */}
          {ralphProgress && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(16, 185, 129, 0.08)',
                borderTop: '1px solid rgba(16, 185, 129, 0.2)',
                borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                animation: 'slideIn 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="pulse-indicator" /> {t('chat.ralphRunning')}
                </span>
                <span style={{ fontSize: '10px', color: '#a7f3d0', background: 'rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                  #{ralphProgress.iteration} | ${ralphProgress.cost.toFixed(5)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1' }}>
                {ralphProgress.message}
              </p>
            </div>
          )}

          {/* Phase 6C: Image Preview */}
          {attachedImage && (
            <div style={{ padding: '8px 14px', background: 'rgba(30, 41, 59, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src={attachedImage} alt="Preview" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('chat.attachedImage')}</span>
              <button onClick={() => setAttachedImage(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '14px' }}>✕</button>
            </div>
          )}

          {/* Phase 6A: Slash Command Autocomplete */}
          {showSlashMenu && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '14px',
                right: '14px',
                background: 'rgba(30, 41, 59, 0.95)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '4px',
                zIndex: 100,
                maxHeight: '200px',
                overflow: 'auto',
              }}
            >
              {filteredSlashCmds.map((cmd) => (
                <button
                  key={cmd.trigger}
                  onClick={() => {
                    setInput(cmd.trigger + ' ');
                    setShowSlashMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#f1f5f9',
                    fontSize: '12px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 700, color: '#a5b4fc', minWidth: '100px' }}>{cmd.trigger}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{cmd.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Input Box */}
          <div
            style={{
              padding: '14px',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              background: 'rgba(30, 41, 59, 0.2)',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              position: 'relative',
            }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
                if (e.key === 'Escape') setShowSlashMenu(false);
              }}
              onPaste={handlePaste}
              disabled={false}
              placeholder={
                connectionStatus === 'connected'
                  ? modelOptions.length === 0
                    ? t('chat.placeholderNoApi')
                    : t('chat.placeholderConnected')
                  : connectionStatus === 'connecting'
                  ? t('chat.placeholderConnecting')
                  : t('chat.placeholderDisconnected')
              }
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                color: '#f8fafc',
                fontSize: '13px',
                outline: 'none',
                transition: 'border 0.2s',
              }}
              className="focus-ring"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                transition: 'transform 0.1s, opacity 0.2s',
                boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)',
                opacity: (!input.trim() || isSending) ? 0.5 : 1,
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              ➤
            </button>
            {/* Phase 6C: Image attach button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && file.type.startsWith('image/')) {
                  const reader = new FileReader();
                  reader.onload = () => setAttachedImage(reader.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title={t('chat.attachImage')}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(15, 23, 42, 0.4)',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
              }}
            >
              🖼️
            </button>
          </div>
        </>
      )}

      {/* ==============================================================================
          HUMAN-IN-THE-LOOP TOOL APPROVAL MODAL (Glassmorphism Neon style)
          ============================================================================== */}
      {approvalRequest && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 9999,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '300px',
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(244, 63, 94, 0.3)', // Red warning border
              boxShadow: '0 8px 32px rgba(244, 63, 94, 0.2)', // Neon red glow
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <span style={{ fontWeight: 700, fontSize: '13px', color: '#f43f5e', letterSpacing: '1px' }}>
                {t('chat.approveTool')}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>{t('chat.toolName')}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', fontFamily: 'var(--font-mono)' }}>
                {approvalRequest.name}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>{t('chat.parameters')}</span>
              <pre
                style={{
                  margin: 0,
                  padding: '10px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#cbd5e1',
                  maxHeight: '120px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {approvalRequest.arguments}
              </pre>
            </div>

            {approvalRequest.warningMessage && (
              <div
                style={{
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '11px',
                  color: '#fda4af',
                  lineHeight: '1.5',
                }}
              >
                🚨 **{t('chat.warning')}** {approvalRequest.warningMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={() => handleRejectTool()}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  background: 'rgba(15, 23, 42, 0.4)',
                  color: '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(15, 23, 42, 0.4)')}
              >
                {t('chat.reject')}
              </button>
              <button
                onClick={handleApproveTool}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)',
                  transition: 'transform 0.1s',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {t('chat.approve')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
