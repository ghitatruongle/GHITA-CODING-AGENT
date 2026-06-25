import { lookup } from 'node:dns/promises';
import { URL } from 'node:url';

/**
 * Expand an IPv6 address to its full 8-group canonical form for safe comparison.
 * E.g. '::1' → '0000:0000:0000:0000:0000:0000:0000:0001'
 */
function normalizeIPv6(ip: string): string {
  // Remove brackets
  const clean = ip.replace(/[[\]]/g, '').toLowerCase().trim();

  // Split on '::' to handle compression
  const halves = clean.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];

  // Pad to fill 8 groups
  const missing = 8 - left.length - right.length;
  const middle = new Array(Math.max(0, missing)).fill('0');
  const groups = [...left, ...middle, ...right];

  // Pad each group to 4 hex digits
  return groups.map((g) => g.padStart(4, '0')).join(':');
}

/**
 * Checks if a URL is safe from SSRF attacks by resolving its hostname
 * and checking if the resolved IP is in private/loopback/local subnets.
 */
export async function isSafeUrl(urlStr: string): Promise<boolean> {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname;

    // Check if hostname is directly an IP address
    let ip = hostname;
    const isIpv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
    const isIpv6 = hostname.includes(':');

    if (!isIpv4 && !isIpv6) {
      // Resolve hostname to IP address
      const result = await lookup(hostname);
      ip = result.address;
    }

    // Check IPv4 private and loopback ranges
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
      const parts = ip.split('.').map(Number);
      const [p0, p1] = parts as [number, number];

      if (parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        return false;
      }

      // 127.0.0.0/8 (Loopback)
      if (p0 === 127) return false;
      // 10.0.0.0/8 (Private)
      if (p0 === 10) return false;
      // 172.16.0.0/12 (Private)
      if (p0 === 172 && p1 >= 16 && p1 <= 31) return false;
      // 192.168.0.0/16 (Private)
      if (p0 === 192 && p1 === 168) return false;
      // 169.254.0.0/16 (Link-local)
      if (p0 === 169 && p1 === 254) return false;
      // 0.0.0.0 (Any/Local)
      if (p0 === 0) return false;
    }

    // Check IPv6 private and loopback ranges
    if (ip.includes(':')) {
      const normalized = normalizeIPv6(ip);
      // Loopback ::1
      if (normalized === '0000:0000:0000:0000:0000:0000:0000:0001') {
        return false;
      }
      // Unspecified ::
      if (normalized === '0000:0000:0000:0000:0000:0000:0000:0000') {
        return false;
      }
      // Link-local (fe80::/10)
      if (normalized.startsWith('fe80:')) return false;
      // Unique Local (fc00::/7 — fc00:: and fd00::)
      if (normalized.startsWith('fc00:') || normalized.startsWith('fd00:')) return false;
    }

    return true;
  } catch (error) {
    // If resolution fails or URL is invalid, treat as unsafe
    return false;
  }
}

/**
 * Perform a safe fetch request that resolves URLs and blocks SSRF targets.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const safe = await isSafeUrl(url);
  if (!safe) {
    throw new Error(`SSRF blocked request to: ${url}`);
  }
  return fetch(url, init);
}

/**
 * Generate a unique session key for tracking queues per session/channel
 */
export function getSessionKey(provider: string, chatId: string): string {
  return `${provider}:${chatId}`;
}
