// ==============================================================================
// GHITA CODING AGENT — Chat Messages Component
// Message list with auto-scroll, streaming indicator, and embedded cards.
// ==============================================================================

import { useRef, useCallback, useEffect } from 'react';
import {
  ComputerUsePreviewComponent,
  MarkdownMessage,
} from '../ChatMessageContent';
import type { ChatMessage } from '../../hooks/useChatSessions';

interface ChatMessagesProps {
  messages: ChatMessage[];
  lang: string;
}

export function ChatMessages({ messages, lang }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const userPinnedToBottomRef = useRef(true);

  const isNearBottom = useCallback((thresholdPx = 80) => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= thresholdPx;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !userPinnedToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      userPinnedToBottomRef.current = isNearBottom();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isNearBottom]);

  return (
    <div
      ref={messagesContainerRef}
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
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
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
            <MarkdownMessage content={msg.content} />

            {msg.imageAttachment && (
              <img
                src={msg.imageAttachment}
                alt="Attached"
                style={{
                  maxWidth: '100%',
                  borderRadius: '8px',
                  marginTop: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
            )}

            {msg.computerUsePreview && (
              <ComputerUsePreviewComponent preview={msg.computerUsePreview} />
            )}

            {msg.mcpCard && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  background: msg.mcpCard.isError
                    ? 'rgba(239,68,68,0.1)'
                    : 'rgba(99,102,241,0.1)',
                  border: `1px solid ${msg.mcpCard.isError ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)'}`,
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: msg.mcpCard.isError ? '#f87171' : '#a5b4fc',
                    marginBottom: '4px',
                  }}
                >
                  🔌 MCP: {msg.mcpCard.tool}
                </div>
                <div
                  style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}
                >
                  Server: {msg.mcpCard.server}
                </div>
                <pre
                  style={{
                    margin: 0,
                    color: '#cbd5e1',
                    fontSize: '11px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '100px',
                    overflow: 'auto',
                  }}
                >
                  {msg.mcpCard.result}
                </pre>
              </div>
            )}

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
                  <div
                    key={i}
                    style={{
                      marginBottom: '6px',
                      paddingLeft: '8px',
                      borderLeft: '2px solid rgba(59,130,246,0.3)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#93c5fd' }}>{r.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      {r.snippet.substring(0, 100)}...
                    </div>
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
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <span>
              {new Date(msg.timestamp).toLocaleTimeString(
              lang === 'vi' ? 'vi-VN' : lang === 'zh' ? 'zh-CN' : 'en-US',
              { hour: '2-digit', minute: '2-digit' },
            )}
            </span>
            <span style={{ opacity: 0.5 }}>~{Math.ceil(msg.content.length / 4)} tok</span>
          </span>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
