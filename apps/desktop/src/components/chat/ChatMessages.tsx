// ==============================================================================
// GHITA CODING AGENT — Chat Messages Component
// Message list with auto-scroll, streaming indicator, and embedded cards.
// ==============================================================================

import { memo, useRef, useCallback, useEffect, useState } from 'react';
import { ComputerUsePreviewComponent, MarkdownMessage } from '../ChatMessageContent';
import type { ChatMessage } from '../../hooks/useChatSessions';

// ----------------------------------------------------------------------------
// MessageBubble — memoized per message so a streaming update to one message
// (or appending a new one) never forces every past message to re-render and
// re-parse its markdown on each 50ms flush.
// ----------------------------------------------------------------------------

const MessageBubble = memo(function MessageBubble({
  msg,
  lang,
}: {
  msg: ChatMessage;
  lang: string;
}) {
  return (
    <div
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
              ? 'linear-gradient(135deg, var(--bg-active) 0%, var(--accent-secondary) 100%)'
              : 'var(--bg-card)',
          border:
            msg.role === 'user'
              ? `1px solid var(--border-accent)`
              : `1px solid var(--border-subtle)`,
          color: 'var(--text-primary)',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: msg.role === 'user' ? 'var(--shadow-glow)' : 'none',
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
              border: '1px solid var(--border-default)',
            }}
          />
        )}

        {msg.computerUsePreview && <ComputerUsePreviewComponent preview={msg.computerUsePreview} />}

        {msg.mcpCard && (
          <div
            style={{
              marginTop: '8px',
              padding: '10px 12px',
              background: msg.mcpCard.isError ? 'var(--error-bg)' : 'var(--info-bg)',
              border: `1px solid ${msg.mcpCard.isError ? 'var(--error)' : 'var(--accent-primary)'}`,
              borderRadius: '8px',
              fontSize: '12px',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: msg.mcpCard.isError ? 'var(--error)' : 'var(--accent-primary)',
                marginBottom: '4px',
              }}
            >
              🔌 MCP: {msg.mcpCard.tool}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>
              Server: {msg.mcpCard.server}
            </div>
            <pre
              style={{
                margin: 0,
                color: 'var(--text-secondary)',
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
              background: 'var(--info-bg)',
              border: '1px solid var(--info)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--info)', marginBottom: '6px' }}>
              🌐 Search: {msg.searchCard.query}
            </div>
            {msg.searchCard.results.map((r, i) => (
              <div
                key={i}
                style={{
                  marginBottom: '6px',
                  paddingLeft: '8px',
                  borderLeft: '2px solid var(--info)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--info)' }}>{r.title}</div>
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
  );
});

interface ChatMessagesProps {
  messages: ChatMessage[];
  lang: string;
}

export function ChatMessages({ messages, lang }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const userPinnedToBottomRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const isNearBottom = useCallback((thresholdPx = 80) => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= thresholdPx;
  }, []);

  const scrollToBottom = useCallback(
    (force = false) => {
      if (!force && !userPinnedToBottomRef.current) return;
      // `auto` during streaming (fires every ~50 ms) — restarting a smooth
      // animation at that frequency stutters; instant snaps are smooth enough.
      const streaming = messages.some((m) => m.isStreaming);
      messagesEndRef.current?.scrollIntoView({
        behavior: streaming ? 'auto' : 'smooth',
      });
    },
    [messages],
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Track scroll position for scroll-to-bottom button
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = isNearBottom();
      userPinnedToBottomRef.current = nearBottom;
      setShowScrollBottom(!nearBottom);
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
        position: 'relative',
      }}
      className="custom-scrollbar"
    >
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} lang={lang} />
      ))}
      {showScrollBottom && (
        <button
          onClick={() => {
            userPinnedToBottomRef.current = true;
            setShowScrollBottom(false);
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            padding: '6px 14px',
            fontSize: 12,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          ↓ {lang === 'vi' ? 'Cuộn xuống' : lang === 'zh' ? '滚动到底部' : 'Scroll to bottom'}
        </button>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
