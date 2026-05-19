// ==============================================================================
// GHITA CODING AGENT — API Manager Component
// ==============================================================================

import { useState } from 'react';

interface ApiKeyEntry {
  id: string;
  provider: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  active: boolean;
}

const INITIAL_KEYS: ApiKeyEntry[] = [
  { id: '1', provider: 'openai',    name: 'OpenAI',       apiKey: '', baseUrl: 'https://api.openai.com/v1',         model: 'gpt-4o',             active: false },
  { id: '2', provider: 'anthropic', name: 'Anthropic',    apiKey: '', baseUrl: 'https://api.anthropic.com',          model: 'claude-sonnet-4-20250514',   active: false },
  { id: '3', provider: 'google',    name: 'Google Gemini',apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-1.5-pro', active: false },
  { id: '4', provider: 'ollama',    name: 'Ollama (Local)',apiKey: '', baseUrl: 'http://localhost:11434',           model: 'llama3',             active: false },
  { id: '5', provider: 'custom',    name: 'Custom',       apiKey: '', baseUrl: '',                                   model: '',                   active: false },
];

export function ApiManager() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>(INITIAL_KEYS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');

  const handleSaveKey = (id: string) => {
    setKeys((prev) =>
      prev.map((k) =>
        k.id === id ? { ...k, apiKey: editKey, active: editKey.length > 0 } : k,
      ),
    );
    setEditingId(null);
    setEditKey('');
  };

  const maskKey = (key: string): string => {
    if (!key) return '—';
    if (key.length <= 8) return '•'.repeat(key.length);
    return key.slice(0, 4) + '•'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
  };

  return (
    <div style={{ padding: '24px', overflow: 'auto', height: '100%' }}>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          marginBottom: '8px',
          background: 'var(--accent-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        🔑 API Management
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '13px' }}>
        Quản lý API keys cho các AI providers. Keys sẽ được mã hóa AES-256 khi lưu (Phase 4).
      </p>

      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
        }}
      >
        {/* Table Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 200px 120px 100px 80px',
            padding: '12px 20px',
            background: 'rgba(168, 85, 247, 0.08)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--accent-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          <span>Provider</span>
          <span>API Key</span>
          <span>Model</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {/* Rows */}
        {keys.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 200px 120px 100px 80px',
              padding: '14px 20px',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-subtle)',
              transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {entry.name}
            </span>

            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
              {editingId === entry.id ? (
                <input
                  type="password"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveKey(entry.id);
                    if (e.key === 'Escape') { setEditingId(null); setEditKey(''); }
                  }}
                  placeholder="sk-xxx..."
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              ) : (
                maskKey(entry.apiKey)
              )}
            </span>

            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {entry.model || '—'}
            </span>

            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: entry.active ? 'var(--success)' : 'var(--text-muted)',
              }}
            >
              {entry.active ? '● Active' : '○ Inactive'}
            </span>

            <div style={{ display: 'flex', gap: '6px' }}>
              {editingId === entry.id ? (
                <button
                  onClick={() => handleSaveKey(entry.id)}
                  style={{
                    padding: '4px 10px',
                    background: 'var(--success-bg)',
                    color: 'var(--success)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                >
                  Save
                </button>
              ) : (
                <button
                  onClick={() => {
                    setEditingId(entry.id);
                    setEditKey(entry.apiKey);
                  }}
                  style={{
                    padding: '4px 10px',
                    background: 'var(--bg-active)',
                    color: 'var(--accent-primary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: '1px solid rgba(129, 140, 248, 0.2)',
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
