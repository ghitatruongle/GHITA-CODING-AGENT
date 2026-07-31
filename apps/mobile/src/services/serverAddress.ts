const LOCAL_IPV4_PATTERNS = [
  /^10\.(?:\d{1,3}\.){2}\d{1,3}$/,
  /^192\.168\.(?:\d{1,3})\.(?:\d{1,3})$/,
  /^172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.(?:\d{1,3})$/,
  /^127\.(?:\d{1,3}\.){2}\d{1,3}$/,
];

function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  if (LOCAL_IPV4_PATTERNS.some((pattern) => pattern.test(host))) {
    return host
      .split('.')
      .every((part) => Number.isInteger(Number(part)) && Number(part) >= 0 && Number(part) <= 255);
  }
  return /^(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/i.test(host);
}

/**
 * Cleartext transport is permitted only for loopback and RFC1918/ULA hosts.
 * Public destinations must use TLS.
 */
export function assertSafeServerAddress(address: string): URL {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error('Invalid server address.');
  }
  if (url.username || url.password) {
    throw new Error('Server addresses must not contain credentials.');
  }
  if (url.protocol === 'https:' || url.protocol === 'wss:') return url;
  if ((url.protocol === 'http:' || url.protocol === 'ws:') && isLocalHost(url.hostname)) {
    return url;
  }
  throw new Error('Cleartext connections are allowed only to private LAN addresses.');
}
