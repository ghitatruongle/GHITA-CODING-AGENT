// Extracted from WebViewPanel (v0.1.5)
export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  displayUrl: string; 
  isLoading: boolean;
  faviconUrl: string;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
}

export const DEFAULT_TAB = (): BrowserTab => ({
  id: `tab_${Date.now()}`,
  title: 'New Tab',
  url: '',
  displayUrl: '',
  isLoading: false,
  faviconUrl: '',
});

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    try {
      
      const withHttps = `https://${trimmed}`;
      new URL(withHttps);
      
      if (trimmed.includes('.') && !trimmed.includes(' ')) {
        return withHttps;
      }
    } catch {}
    
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}
