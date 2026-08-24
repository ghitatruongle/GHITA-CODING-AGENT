// v0.4.9 C1/C2/C3: Connection utilities (backoff, adaptive streaming, pairing)
//
// Pure, platform-agnostic helpers shared by the desktop sidecar and the mobile
// app so the reconnect/streaming/pairing logic is tested once in @ghita/shared
// rather than duplicated in React Native / Node.

// ── C1: Exponential backoff with jitter ────────────────────────────────────

export interface BackoffOptions {
  /** Base delay in ms (attempt 1). Default 1000. */
  baseMs?: number;
  /** Maximum delay in ms. Default 30000. */
  maxMs?: number;
  /** Jitter ratio in [0,1); actual delay is scaled by 1 ± jitter. Default 0.2. */
  jitter?: number;
  /** Deterministic RNG in [0,1) for testing. Default Math.random. */
  random?: () => number;
}

/**
 * Compute the delay before reconnect attempt `attempt` (1-based) using capped
 * exponential backoff with optional jitter. Unbounded attempts are supported —
 * the delay simply saturates at `maxMs`.
 */
export function computeBackoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? 1000;
  const maxMs = options.maxMs ?? 30_000;
  const jitter = Math.min(0.99, Math.max(0, options.jitter ?? 0.2));
  const random = options.random ?? Math.random;

  const safeAttempt = Math.max(1, Math.floor(attempt));
  // 2^(attempt-1) * base, capped. Guard against Infinity for large attempts.
  const exp = Math.min(maxMs, baseMs * 2 ** Math.min(30, safeAttempt - 1));
  const jitterFactor = 1 - jitter + random() * (2 * jitter);
  return Math.round(Math.min(maxMs, Math.max(0, exp * jitterFactor)));
}

// ── C3: Adaptive screen-streaming quality ───────────────────────────────────

export type StreamQualityLevel = 'high' | 'medium' | 'low';

export interface StreamQuality {
  level: StreamQualityLevel;
  /** JPEG quality 1..100. */
  jpegQuality: number;
  /** Target frames per second. */
  fps: number;
}

const QUALITY_TABLE: Record<StreamQualityLevel, StreamQuality> = {
  high: { level: 'high', jpegQuality: 80, fps: 15 },
  medium: { level: 'medium', jpegQuality: 60, fps: 8 },
  low: { level: 'low', jpegQuality: 40, fps: 4 },
};

/**
 * Pick a streaming quality from the measured round-trip time (ms). Lower RTT →
 * higher quality. Thresholds: <150ms high, <400ms medium, otherwise low.
 */
export function selectStreamQuality(rttMs: number): StreamQuality {
  if (!Number.isFinite(rttMs) || rttMs < 0) return QUALITY_TABLE.medium;
  if (rttMs < 150) return QUALITY_TABLE.high;
  if (rttMs < 400) return QUALITY_TABLE.medium;
  return QUALITY_TABLE.low;
}

/** Get the fixed quality preset for a manual override. */
export function streamQualityForLevel(level: StreamQualityLevel): StreamQuality {
  return QUALITY_TABLE[level];
}

// ── C2: QR pairing payload codec ─────────────────────────────────────────────

export interface PairingPayload {
  /** LAN IP or host of the desktop sidecar. */
  host: string;
  /** Socket.IO port. */
  port: number;
  /** 6-char pairing code. */
  code: string;
  /** Optional session token seed. */
  token?: string;
}

const PAIRING_SCHEME = 'ghita://pair';

/**
 * Encode a pairing payload into a compact `ghita://pair?...` URI suitable for a
 * QR code shown on the desktop and scanned by the mobile app.
 */
export function encodePairingPayload(payload: PairingPayload): string {
  const params = new URLSearchParams({
    host: payload.host,
    port: String(payload.port),
    code: payload.code,
  });
  if (payload.token) params.set('token', payload.token);
  return `${PAIRING_SCHEME}?${params.toString()}`;
}

/**
 * Decode a `ghita://pair?...` URI back into a payload. Returns null when the
 * URI is malformed or missing required fields (host/port/code).
 */
export function decodePairingPayload(uri: string): PairingPayload | null {
  if (typeof uri !== 'string' || !uri.startsWith(`${PAIRING_SCHEME}?`)) return null;
  const query = uri.slice(`${PAIRING_SCHEME}?`.length);
  const params = new URLSearchParams(query);
  const host = params.get('host');
  const portRaw = params.get('port');
  const code = params.get('code');
  if (!host || !portRaw || !code) return null;
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return null;
  const token = params.get('token') ?? undefined;
  return { host, port, code, ...(token ? { token } : {}) };
}
