// ==============================================================================
// GHITA CODING AGENT — Premium AI Chat Panel (Glassmorphism & Live Streaming)
// ==============================================================================

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { invoke } from '@tauri-apps/api/core';
import { generateUUID } from '@ghita/shared';

// --- Types mirroring ApiManager storage schema ---
type ProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';

interface ApiKeyEntry {
  providerId: ProviderId;
  apiKey: string;
  baseUrl: string;
  selectedModel: string;
  active: boolean;
  availableModels: string[];
}

const PROVIDER_LABELS: Record<ProviderId, { name: string; icon: string }> = {
  openai:    { name: 'OpenAI',          icon: '🟢' },
  anthropic: { name: 'Anthropic',       icon: '🟣' },
  google:    { name: 'Google Gemini',   icon: '🔵' },
  ollama:    { name: 'Ollama (Local)',   icon: '🦙' },
  custom:    { name: 'Custom Provider', icon: '⚙️' },
};

interface DynamicModelOption {
  value: string;       // e.g. 'openai/gpt-4o'
  label: string;       // e.g. '🟢 OpenAI — gpt-4o'
  providerId: string;  // e.g. 'openai'
  model: string;       // e.g. 'gpt-4o'
}

/** Build flat model option list from localStorage API keys */
function buildModelOptions(): DynamicModelOption[] {
  try {
    const raw = localStorage.getItem('ghita_api_keys');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Record<ProviderId, Partial<ApiKeyEntry>>>;
    const options: DynamicModelOption[] = [];

    for (const [id, entry] of Object.entries(parsed)) {
      const pid = id as ProviderId;
      if (!entry) continue;

      // Provider must be active
      if (!entry.active) continue;

      // Non-ollama providers must have a non-empty API key
      if (pid !== 'ollama' && (!entry.apiKey || entry.apiKey.trim() === '')) continue;

      const meta = PROVIDER_LABELS[pid] || { name: pid, icon: '🔷' };
      const models = entry.availableModels && entry.availableModels.length > 0
        ? entry.availableModels
        : entry.selectedModel
          ? [entry.selectedModel]
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
}

interface ToolApprovalRequest {
  toolCallId: string;
  name: string;
  arguments: string;
  warningMessage?: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'assistant',
    content: '👋 Xin chào! Tôi là **GHITA AI Assistant** tích hợp lõi gRPC của **OpenClaude** và **Claude Code**. Tôi có khả năng stream token cực nhanh, chạy các workflow thông minh và thực thi command an toàn dưới sự duyệt quyền của bạn. Hãy hỏi tôi bất cứ điều gì!',
    timestamp: Date.now() - 60000,
  },
];

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  // Dynamic model list — loaded from localStorage API keys
  const [modelOptions, setModelOptions] = useState<DynamicModelOption[]>(buildModelOptions);
  const [provider, setProvider] = useState<string>(() => {
    const opts = buildModelOptions();
    return opts.length > 0 ? opts[0]!.value : '';
  });

  // Sync model options when localStorage changes (e.g. user configures keys in API Manager tab)
  useEffect(() => {
    const refresh = () => {
      const newOptions = buildModelOptions();
      setModelOptions(newOptions);
      // If current selection is no longer valid, reset to first available
      if (newOptions.length > 0 && !newOptions.some((o) => o.value === provider)) {
        setProvider(newOptions[0]!.value);
      }
    };

    // Listen for cross-tab storage changes
    window.addEventListener('storage', refresh);

    // Also poll every 3 seconds for same-tab changes (localStorage events don't fire in same tab)
    const interval = setInterval(refresh, 3000);

    return () => {
      window.removeEventListener('storage', refresh);
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
    { trigger: '/compact', name: 'Compact Context', description: 'Tóm tắt conversation' },
    { trigger: '/clear', name: 'Clear Chat', description: 'Xóa lịch sử chat' },
    { trigger: '/help', name: 'Help', description: 'Hiển thị trợ giúp' },
    { trigger: '/code-review', name: 'Code Review', description: 'Review code' },
    { trigger: '/feature-dev', name: 'Feature Dev', description: 'Phát triển tính năng' },
    { trigger: '/deploy-check', name: 'Deploy Check', description: 'Kiểm tra deploy' },
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
        const socket = io(`http://localhost:${port}`, {
          transports: ['websocket'],
          reconnectionAttempts: 10,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          if (active) setConnectionStatus('connected');
          console.log('[ChatPanel] Connected to sidecar Socket.io server.');
        });

        socket.on('disconnect', () => {
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

        socket.on('chat_done', (data: { text: string }) => {
          if (!active) return;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === 'streaming-message'
                ? { id: generateUUID(), role: 'assistant', content: data.text, timestamp: Date.now() }
                : msg
            )
          );
          setIsSending(false);
        });

        socket.on('chat_error', (data: { message: string }) => {
          if (!active) return;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === 'streaming-message'
                ? { id: generateUUID(), role: 'assistant', content: `❌ **Lỗi Hệ Thống:** ${data.message}`, timestamp: Date.now() }
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
  }, []);

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

  const handleSend = () => {
    if (!input.trim() || isSending || !socketRef.current) return;

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
      const history = messages
        .filter((msg) => msg.id !== 'streaming-message')
        .slice(-10) // Limit to last 10 messages for token context
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      // Split 'providerId/modelName' from the select value
      const slashIdx = provider.indexOf('/');
      const selectedProvider = slashIdx > 0 ? provider.substring(0, slashIdx) : provider;
      const selectedModel = slashIdx > 0 ? provider.substring(slashIdx + 1) : undefined;

      // Emit event through Socket.io to trigger AI Engine
      socketRef.current.emit('chat', {
        text: input,
        isDesktop: true,
        provider: selectedProvider,
        model: selectedModel,
        agentRole: agentRole,
        history: [...history, { role: 'user', content: input }],
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
            OPENCLAUDE ENGINE
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
        </div>

        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          disabled={modelOptions.length === 0}
          title={modelOptions.length === 0 ? 'Chưa cấu hình API Key — Vào tab API để thêm' : 'Chọn AI Model'}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            background: 'rgba(15, 23, 42, 0.6)',
            border: modelOptions.length === 0
              ? '1px solid rgba(239, 68, 68, 0.3)'
              : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: modelOptions.length === 0 ? '#f87171' : '#cbd5e1',
            outline: 'none',
            cursor: modelOptions.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'border 0.2s, color 0.2s',
            maxWidth: '220px',
          }}
        >
          {modelOptions.length === 0 ? (
            <option value="" style={{ background: '#1e293b', color: '#f87171' }}>
              ⚠️ Chưa cấu hình API Key
            </option>
          ) : (
            modelOptions.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: '#1e293b', color: '#f1f5f9' }}>
                {opt.label}
              </option>
            ))
          )}
        </select>
      </div>

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
              {/* Highlight special text */}
              {msg.content.startsWith('👋 Xin chào!') ? (
                <div>
                  👋 Xin chào! Tôi là <strong style={{ color: '#a5b4fc' }}>GHITA AI Assistant</strong> tích hợp lõi gRPC của <strong style={{ color: '#a5b4fc' }}>OpenClaude</strong> và <strong style={{ color: '#a5b4fc' }}>Claude Code</strong>. Tôi có khả năng stream token cực nhanh, chạy các workflow thông minh và thực thi command an toàn dưới sự duyệt quyền của bạn. Hãy hỏi tôi bất cứ điều gì!
                </div>
              ) : (
                msg.content
              )}
              
              {/* Phase 6C: Image attachment display */}
              {msg.imageAttachment && (
                <img
                  src={msg.imageAttachment}
                  alt="Attached"
                  style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                />
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
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(148, 163, 184, 0.6)',
                marginTop: '4px',
                padding: '0 4px',
              }}
            >
              {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Smart Workflow Control Bar */}
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(30, 41, 59, 0.35)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Agent Role Routing Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Agent Router:
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['default', 'Explore', 'Plan', 'UI'] as const).map((role) => (
              <button
                key={role}
                onClick={() => setAgentRole(role)}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid ' + (agentRole === role ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.05)'),
                  background: agentRole === role ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                  color: agentRole === role ? '#a5b4fc' : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* Ralph Loop Switch & Cost Tracker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setRalphMode(!ralphMode)}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '6px',
              border: '1px solid ' + (ralphMode ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.08)'),
              background: ralphMode
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)'
                : 'rgba(15, 23, 42, 0.4)',
              color: ralphMode ? '#34d399' : '#94a3b8',
              cursor: 'pointer',
              boxShadow: ralphMode ? '0 0 8px rgba(16, 185, 129, 0.2)' : 'none',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>🔄</span>
            <span>RALPH LOOP: {ralphMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* Workflow triggers */}
          <button
            onClick={() => setInput('/code-review ')}
            style={{
              padding: '4px 8px',
              fontSize: '10px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              background: 'rgba(15, 23, 42, 0.4)',
              color: '#cbd5e1',
              cursor: 'pointer',
            }}
          >
            🕵️ Review
          </button>

          <button
            onClick={() => setInput('/feature-dev ')}
            style={{
              padding: '4px 8px',
              fontSize: '10px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              background: 'rgba(15, 23, 42, 0.4)',
              color: '#cbd5e1',
              cursor: 'pointer',
            }}
          >
            ⚡ Feature
          </button>
        </div>
      </div>

      {/* Ralph Loop Active Dashboard Card */}
      {ralphProgress && (
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(16, 185, 129, 0.08)',
            borderTop: '1px solid rgba(16, 185, 129, 0.2)',
            borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            animation: 'slideIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="pulse-indicator" /> VÒNG LẶP SỬA LỖI ĐANG CHẠY (RALPH LOOP)
            </span>
            <span style={{ fontSize: '10px', color: '#a7f3d0', background: 'rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
              Lượt sửa: #{ralphProgress.iteration} | Chi phí tích lũy: ${ralphProgress.cost.toFixed(5)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
            {ralphProgress.message}
          </p>
        </div>
      )}

      {/* Phase 6B: Context Usage Bar */}
      <div
        style={{
          padding: '4px 14px',
          background: 'rgba(30, 41, 59, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: 'rgba(148, 163, 184, 0.5)',
          borderTop: '1px solid rgba(255,255,255,0.03)',
        }}
      >
        <span>Context: {contextUsage.used.toLocaleString()} / {contextUsage.max.toLocaleString()} tokens</span>
        <div style={{ width: '60px', height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, contextUsage.percentage)}%`, background: contextUsage.percentage > 80 ? '#f87171' : '#818cf8', borderRadius: '2px' }} />
        </div>
      </div>

      {/* Phase 6C: Image Preview */}
      {attachedImage && (
        <div style={{ padding: '8px 14px', background: 'rgba(30, 41, 59, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={attachedImage} alt="Preview" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ảnh đã đính kèm</span>
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
          disabled={connectionStatus !== 'connected'}
          placeholder={connectionStatus === 'connected' ? "Hỏi AI hoặc gõ / cho commands..." : "Chờ kết nối server..."}
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
          disabled={!input.trim() || isSending || connectionStatus !== 'connected'}
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
            opacity: (!input.trim() || isSending || connectionStatus !== 'connected') ? 0.5 : 1,
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
          title="Đính kèm ảnh"
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
                DUYỆT CHẠY LỆNH (TOOL)
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Tên Tool:</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', fontFamily: 'var(--font-mono)' }}>
                {approvalRequest.name}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Tham số:</span>
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
                🚨 **Cảnh Báo:** {approvalRequest.warningMessage}
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
                Từ chối
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
                Duyệt Chạy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
