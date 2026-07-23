// Extracted from WebViewPanel (v0.1.5)
export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  displayUrl: string; // URL hiển thị trong thanh địa chỉ
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
  // Nếu là search query chứ không phải URL
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    try {
      // Thử parse xem có phải domain không
      const withHttps = `https://${trimmed}`;
      new URL(withHttps);
      // Phải có dấu chấm thì mới là domain
      if (trimmed.includes('.') && !trimmed.includes(' ')) {
        return withHttps;
      }
    } catch {}
    // Không phải URL → search Google
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}
