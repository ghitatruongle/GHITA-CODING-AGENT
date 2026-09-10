// @vitest-environment happy-dom

// useModelSelection (feat-matrix A16): dynamic model options from api-config —
// active gating, key requirement (except ollama/opencode-zen), availableModels
// precedence, auto-select first option, provider/model parsing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useModelSelection } from '../useModelSelection';

const loadApiConfig = vi.fn();
vi.mock('../../utils/apiConfig', () => ({
  loadApiConfig: (...args: unknown[]) => loadApiConfig(...args),
  normalizeApiKeys: (entry: Record<string, unknown>) => {
    const keys = entry['apiKeys'];
    if (Array.isArray(keys)) return keys.filter((k) => typeof k === 'string' && k.length > 0);
    return typeof keys === 'string' && keys.length > 0 ? [keys] : [];
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('useModelSelection', () => {
  it('builds options only for active providers with keys; ollama exempt', async () => {
    loadApiConfig.mockResolvedValue({
      openai: { active: true, apiKeys: ['sk-test'], selectedModel: 'gpt-4o' },
      anthropic: { active: false, apiKeys: ['sk-ant'], selectedModel: 'claude' },
      gemini: { active: true, apiKeys: [], selectedModel: 'gemini-pro' },
      ollama: { active: true, availableModels: ['llama3', 'qwen'] },
    });
    const { result } = renderHook(() => useModelSelection());
    await waitFor(() => expect(result.current.modelOptions.length).toBe(3));
    const values = result.current.modelOptions.map((o) => o.value);
    expect(values).toEqual(['openai/gpt-4o', 'ollama/llama3', 'ollama/qwen']);
  });

  it('availableModels takes precedence over selectedModel', async () => {
    loadApiConfig.mockResolvedValue({
      openai: { active: true, apiKeys: ['k'], selectedModel: 'old', availableModels: ['a', 'b'] },
    });
    const { result } = renderHook(() => useModelSelection());
    await waitFor(() => expect(result.current.modelOptions.length).toBe(2));
    expect(result.current.modelOptions.map((o) => o.model)).toEqual(['a', 'b']);
  });

  it('auto-selects first option and parses provider/model', async () => {
    loadApiConfig.mockResolvedValue({
      openai: { active: true, apiKeys: ['k'], selectedModel: 'gpt-4o-mini' },
    });
    const { result } = renderHook(() => useModelSelection());
    await waitFor(() => expect(result.current.provider).toBe('openai/gpt-4o-mini'));
    expect(result.current.selectedProviderId).toBe('openai');
    expect(result.current.selectedModel).toBe('gpt-4o-mini');
  });

  it('empty config clears provider; malformed config yields no options', async () => {
    loadApiConfig.mockResolvedValue({});
    const { result } = renderHook(() => useModelSelection());
    await waitFor(() => expect(result.current.modelOptions).toEqual([]));
    expect(result.current.provider).toBe('');

    loadApiConfig.mockResolvedValue(null); // buildModelOptions catches internally
    const { result: r2 } = renderHook(() => useModelSelection());
    await waitFor(() => expect(r2.current.modelOptions).toEqual([]));
  });
});
