// ==============================================================================
// GHITA CODING AGENT — Chat Panel
// ==============================================================================

import { useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'assistant',
    content: '👋 Xin chào! Tôi là GHITA AI Assistant. Tôi có thể giúp bạn code, quản lý file, điều khiển browser, và nhiều hơn nữa. Hãy thử hỏi tôi bất cứ điều gì!',
    timestamp: Date.now() - 60000,
  },
];

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState<string>('openai');

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `[${provider.toUpperCase()}] AI response sẽ được tích hợp trong Phase 4. Bạn đã gửi: "${input}"`,
      timestamp: Date.now() + 100,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-secondary)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--accent-secondary)', fontSize: '14px' }}>
          💬 AI Chat
        </span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              animation: 'slideUp 200ms ease forwards',
            }}
          >
            <div
              style={{
                maxWidth: '90%',
                padding: '10px 14px',
                borderRadius:
                  msg.role === 'user'
                    ? 'var(--radius-md) var(--radius-md) 4px var(--radius-md)'
                    : 'var(--radius-md) var(--radius-md) var(--radius-md) 4px',
                background:
                  msg.role === 'user'
                    ? 'rgba(129, 140, 248, 0.2)'
                    : 'var(--bg-surface)',
                border:
                  msg.role === 'user'
                    ? '1px solid rgba(129, 140, 248, 0.3)'
                    : '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                lineHeight: 1.6,
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                marginTop: '4px',
                padding: '0 4px',
              }}
            >
              {new Date(msg.timestamp).toLocaleTimeString('vi-VN')}
            </span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Hỏi AI..."
          style={{
            flex: 1,
            padding: '10px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          }}
        />
        <button
          onClick={handleSend}
          style={{
            padding: '10px 16px',
            background: 'var(--accent-primary)',
            color: '#fff',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: '14px',
            transition: 'opacity var(--transition-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
