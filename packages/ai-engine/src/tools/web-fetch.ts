// ==============================================================================
// GHITA CODING AGENT - Web Fetch Tool
// ==============================================================================

export interface FetchResponse {
  url: string;
  title: string;
  content: string;
  contentType: string;
  statusCode: number;
}

// v1.0.0 deep-review fix (M11): SSRF guard mirroring the Rust proxy policy.
// A prompt-injected agent must not be able to pivot web_fetch into loopback
// services, private LAN hosts, or cloud metadata endpoints. Hostnames are
// resolved and every A/AAAA record is checked; DNS rebinding is mitigated by
// pinning the resolved IP with a Host header.
export function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  const p0 = parts[0] ?? -1;
  const p1 = parts[1] ?? -1;
  if (p0 === 0) return true; // 0.0.0.0/8
  if (p0 === 10) return true; // 10.0.0.0/8
  if (p0 === 100 && p1 >= 64 && p1 <= 127) return true; // CGNAT
  if (p0 === 127) return true; // loopback
  if (p0 === 169 && p1 === 254) return true; // link-local + metadata
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true; // 172.16/12
  if (p0 === 192 && p1 === 168) return true; // 192.168/16
  if (p0 >= 224) return true; // multicast/reserved
  return false;
}

export async function assertSafeFetchUrl(rawUrl: string): Promise<{ url: URL; ip: string }> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are allowed.');
  }
  const host = url.hostname;
  // Never touch cloud metadata endpoints by name either.
  if (
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    host === 'metadata.azure.internal'
  ) {
    throw new Error('Cloud metadata endpoints are blocked.');
  }
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (isIp) {
    if (isPrivateIpv4(host)) throw new Error('Private or reserved IP addresses are blocked.');
    return { url, ip: host };
  }
  // Resolve the hostname and reject if ANY record is private (DNS-rebinding safe).
  const dns = await import('node:dns/promises');
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (records.length === 0) throw new Error('Hostname did not resolve.');
  for (const rec of records) {
    const addr = rec.address;
    const isV4 = /^\d+\.\d+\.\d+\.\d+$/.test(addr);
    if (isV4 && isPrivateIpv4(addr)) {
      throw new Error('Hostname resolves to a private or reserved IP address.');
    }
    if (
      addr.startsWith('::1') ||
      addr.startsWith('fe80') ||
      addr.startsWith('fc') ||
      addr.startsWith('fd')
    ) {
      throw new Error('Hostname resolves to a loopback or link-local address.');
    }
  }
  return { url, ip: records[0]?.address ?? host };
}

export class WebFetchTool {
  /** Fetch URL và convert sang markdown-ish text */
  async fetch(url: string): Promise<FetchResponse> {
    // deep-review fix (M11): SSRF validation + DNS pinning before the request.
    const { url: parsedUrl, ip } = await assertSafeFetchUrl(url);
    const init = {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'GHITA-Coding-Agent/0.1.0',
        // Pin the resolved IP so a DNS rebinding attacker cannot swap the
        // address after our validation. The Host header preserves the
        // original hostname for virtual-hosted services.
        Host: parsedUrl.host,
      },
      // undici's fetch accepts a custom lookup; the URL keeps the hostname so
      // TLS SNI and the Host header stay correct while resolution is pinned.
      lookup: (
        _hostname: string,
        _options: unknown,
        callback: (err: Error | null, address: string) => void,
      ) => callback(null, ip),
    } as RequestInit;
    const response = await globalThis.fetch(parsedUrl.toString(), init);

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? 'text/plain';
    const rawText = await response.text();

    let content: string;
    if (contentType.includes('text/html')) {
      content = this.htmlToText(rawText);
    } else {
      content = rawText;
    }

    // Truncate to prevent token overflow
    if (content.length > 8000) {
      content = `${content.substring(0, 8000)}\n\n[Content truncated...]`;
    }

    return {
      url,
      title: this.extractTitle(rawText, contentType),
      content,
      contentType,
      statusCode: response.status,
    };
  }

  /** Extract title from HTML */
  private extractTitle(html: string, contentType: string): string {
    if (!contentType.includes('text/html')) return '';
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match?.[1]?.trim() ?? '';
  }

  /** Convert HTML to readable text */
  private htmlToText(html: string): string {
    let text = html;
    // Remove scripts, styles, nav, footer
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
    // Convert headers to markdown
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    text = text.replace(/<h[4-6][^>]*>(.*?)<\/h[4-6]>/gi, '**$1**\n');
    // Convert links
    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    // Convert code blocks
    text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```');
    // Convert lists
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    // Convert paragraphs
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    // Convert line breaks
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');
    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();
    return text;
  }
}
