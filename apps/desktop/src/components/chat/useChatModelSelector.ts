// ==============================================================================
// GHITA CODING AGENT — Chat Model Selector Hook
// Manages dynamic model list loading, provider selection, and dropdown state.
// ==============================================================================

import { useState, useEffect, useRef } from 'react';
import { type DynamicModelOption, loadModelOptions } from '../../utils/buildModelOptions';

export function useChatModelSelector() {
  const [modelOptions, setModelOptions] = useState<DynamicModelOption[]>([]);
  const [provider, setProvider] = useState<string>('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const wrapper = modelDropdownRef.current;
      const target = e.target as Node | null;
      if (!wrapper || !target) return;
      if (wrapper.contains(target)) return;
      setModelDropdownOpen(false);
      setModelSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelDropdownOpen]);

  // Sync model options when the API Manager updates persisted provider config
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const newOptions = await loadModelOptions();
      if (disposed) return;
      setModelOptions(newOptions);
      if (newOptions.length > 0 && !newOptions.some((o) => o.value === provider)) {
        setProvider(newOptions[0]?.value ?? '');
      } else if (newOptions.length === 0 && provider) {
        setProvider('');
      }
    };

    void refresh();

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);

    const interval = setInterval(() => {
      void refresh();
    }, 10000);

    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [provider]);

  return {
    modelOptions,
    provider,
    setProvider,
    modelDropdownOpen,
    setModelDropdownOpen,
    modelSearch,
    setModelSearch,
    modelDropdownRef,
  };
}
