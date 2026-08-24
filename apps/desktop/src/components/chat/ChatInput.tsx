// Text input, slash command autocomplete, image attachment, and send button.

import React, { useRef } from 'react';
import { VoiceInputButton } from '../VoiceInputButton';

interface SlashCommand {
  trigger: string;
  name: string;
  description: string;
}

interface ChatInputProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  hasModelOptions: boolean;
  // Slash command autocomplete
  showSlashMenu: boolean;
  slashCommands: SlashCommand[];
  filteredSlashCmds: SlashCommand[];
  setShowSlashMenu: (v: boolean) => void;
  setInput: (v: string) => void;
  // Image attachment
  attachedImage: string | null;
  setAttachedImage: (v: string | null) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function ChatInput({
  t,
  input,
  onInputChange,
  onSend,
  isSending,
  connectionStatus,
  hasModelOptions,
  showSlashMenu,
  filteredSlashCmds,
  setShowSlashMenu,
  setInput,
  attachedImage,
  setAttachedImage,
  onPaste,
  onDrop,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const placeholder =
    connectionStatus === 'connected'
      ? !hasModelOptions
        ? t('chat.placeholderNoApi')
        : t('chat.placeholderConnected')
      : connectionStatus === 'connecting'
        ? t('chat.placeholderConnecting')
        : t('chat.placeholderDisconnected');

  return (
    <>
      {/* Image Preview */}
      {attachedImage && (
        <div
          style={{
            padding: '8px 14px',
            background: 'rgba(30, 41, 59, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <img
            src={attachedImage}
            alt="Preview"
            style={{
              width: '40px',
              height: '40px',
              objectFit: 'cover',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {t('chat.attachedImage')}
          </span>
          <button
            onClick={() => setAttachedImage(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Slash Command Autocomplete */}
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
                setInput(`${cmd.trigger} `);
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
            >
              <span style={{ fontWeight: 700, color: '#a5b4fc', minWidth: '100px' }}>
                {cmd.trigger}
              </span>
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
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
            if (e.key === 'Escape') setShowSlashMenu(false);
          }}
          onPaste={onPaste}
          disabled={false}
          placeholder={placeholder as string}
          style={{
            flex: 1,
            padding: '10px 14px',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            color: '#f8fafc',
            fontSize: '13px',
            // ACCESSIBILITY (audit fix 1.3): removed outline:none
            transition: 'border 0.2s',
          }}
          className="focus-ring"
        />
        <button
          onClick={onSend}
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
            opacity: !input.trim() || isSending ? 0.5 : 1,
          }}
        >
          ➤
        </button>
        {/* Voice input button */}
        <VoiceInputButton onResult={(text) => setInput(text)} />
        {/* Image attach button */}
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
  );
}
