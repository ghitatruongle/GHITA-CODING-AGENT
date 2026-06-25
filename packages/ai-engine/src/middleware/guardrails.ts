// ==============================================================================
// GHITA CODING AGENT - Guardrails Middleware
// Phase 3.3: Content filter, PII detector, secret detector, rate limiter, audit logger
// ==============================================================================

import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type { ChatMiddleware, ChatStreamMiddleware } from '../utils/middleware.js';
import type { ChatMessage } from '../types.js';

// --- Types ---

export interface GuardrailsConfig {
  contentFilter?: ContentFilterConfig;
  piiDetector?: PIIDetectorConfig;
  secretDetector?: SecretDetectorConfig;
  rateLimiter?: RateLimiterConfig;
  auditLogger?: AuditLoggerConfig;
}

export interface ContentFilterConfig {
  enabled: boolean;
  blockedPatterns?: RegExp[];
  blockedTopics?: string[];
}

export interface PIIDetectorConfig {
  enabled: boolean;
  maskChar?: string;
}

export interface SecretDetectorConfig {
  enabled: boolean;
  blockOnDetection?: boolean;
}

export interface RateLimiterConfig {
  enabled: boolean;
  maxRequestsPerMinute?: number;
  maxTokensPerMinute?: number;
}

export interface AuditLoggerConfig {
  enabled: boolean;
  logContent?: boolean;
  handler?: (entry: AuditEntry) => void;
}

export interface AuditEntry {
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  contentLength: number;
  piiDetected: boolean;
  secretsDetected: boolean;
  contentBlocked: boolean;
  model?: string;
  provider?: string;
  tokensUsed?: number;
  content?: string;
}

// --- PII Patterns ---

const PII_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  mask: (s: string, char: string) => string;
}> = [
  {
    name: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    mask: (s, c) => s.replace(/./g, (m, i) => (i < 3 || i > s.length - 4 ? m : c)),
  },
  {
    name: 'phone',
    regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    mask: (s, c) => s.slice(0, 3) + c.repeat(s.length - 6) + s.slice(-3),
  },
  {
    name: 'ssn',
    regex: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    mask: (s, c) => c.repeat(s.length - 4) + s.slice(-4),
  },
  {
    name: 'credit_card',
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    mask: (s, c) => c.repeat(s.length - 4) + s.slice(-4),
  },
  {
    name: 'ip_address',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    mask: (s, c) => s.replace(/\d/g, c),
  },
];

// --- Secret Patterns ---

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'openai_key', regex: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'github_token', regex: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'aws_key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'google_api_key', regex: /AIzaSy[a-zA-Z0-9_-]{33}/g },
  { name: 'bearer_token', regex: /Bearer\s+[a-zA-Z0-9._-]{20,}/gi },
  { name: 'private_key', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
  { name: 'jwt_token', regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g },
];

// --- Content Filter Patterns ---

const DEFAULT_BLOCKED_PATTERNS: RegExp[] = [
  /\b(hack|crack|exploit)\s+(into|system|password)\b/gi,
  /\bhow\s+to\s+(make|build|create)\s+(bomb|weapon|virus)\b/gi,
];

// --- Guards ---

function filterContent(
  text: string,
  config: ContentFilterConfig,
): { blocked: boolean; reason?: string } {
  if (!config.enabled) return { blocked: false };
  const patterns = config.blockedPatterns ?? DEFAULT_BLOCKED_PATTERNS;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return { blocked: true, reason: `Content matches blocked pattern: ${pattern.source}` };
    }
  }
  return { blocked: false };
}

function detectPII(text: string, config: PIIDetectorConfig): { detected: boolean; masked: string } {
  if (!config.enabled) return { detected: false, masked: text };
  let masked = text;
  let detected = false;
  const maskChar = config.maskChar ?? '*';
  for (const pattern of PII_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      detected = true;
      pattern.regex.lastIndex = 0;
      masked = masked.replace(pattern.regex, (match) => pattern.mask(match, maskChar));
    }
  }
  return { detected, masked };
}

function detectSecrets(
  text: string,
  config: SecretDetectorConfig,
): { detected: boolean; names: string[] } {
  if (!config.enabled) return { detected: false, names: [] };
  const names: string[] = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      names.push(pattern.name);
    }
  }
  return { detected: names.length > 0, names };
}

// --- Rate Limiter ---

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number, // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1): { allowed: boolean; retryAfterMs?: number } {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return { allowed: true };
    }
    const deficit = tokens - this.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillRate) * 1000);
    return { allowed: false, retryAfterMs };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// --- Middleware Factories ---

export function createContentFilterMiddleware(config: ContentFilterConfig): ChatMiddleware {
  return async ({ messages }, next) => {
    for (const msg of messages) {
      if (msg.role === 'user') {
        const result = filterContent(msg.content ?? '', config);
        if (result.blocked) {
          return {
            content: `[BLOCKED] ${result.reason}`,
            model: 'guardrails',
            provider: 'guardrails' as AIProviderType,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
          };
        }
      }
    }
    return next(messages);
  };
}

export function createPIIDetectorMiddleware(config: PIIDetectorConfig): ChatMiddleware {
  return async ({ messages }, next) => {
    const maskedMessages: ChatMessage[] = messages.map((msg) => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const { masked } = detectPII(msg.content ?? '', config);
        return { ...msg, content: masked };
      }
      return msg;
    });
    return next(maskedMessages);
  };
}

export function createPIIDetectorStreamMiddleware(config: PIIDetectorConfig): ChatStreamMiddleware {
  return async ({ messages }, next) => {
    const maskedMessages: ChatMessage[] = messages.map((msg) => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const { masked } = detectPII(msg.content ?? '', config);
        return { ...msg, content: masked };
      }
      return msg;
    });
    const gen = await next(maskedMessages);
    return (async function* () {
      // SECURITY (audit fix 2.7): use a sliding window buffer that retains
      // enough trailing text to catch PII patterns split across chunk
      // boundaries. The previous implementation only kept a 50-char TAIL_DELAY,
      // which is shorter than a typical email address (~254 chars max) and
      // leaked PII whenever a match straddled the boundary.
      //
      // Window size = max plausible PII match length across all patterns
      // (email RFC 5321 = 254, plus a small safety margin).
      const WINDOW_SIZE = 320;
      // Hard cap on the buffer to prevent unbounded growth if upstream
      // streams never terminate.
      const MAX_BUFFER = 1024 * 1024;
      let buffer = '';
      let yieldedLength = 0;
      const blockedEmitted = false;

      const tryFlush = function* (force: boolean) {
        // We can safely emit everything except the trailing WINDOW_SIZE
        // chars; those need to stay in the buffer in case a PII match
        // straddles the boundary.
        const safeEnd = force
          ? buffer.length
          : Math.max(0, buffer.length - WINDOW_SIZE);
        if (safeEnd > yieldedLength) {
          const out = buffer.slice(yieldedLength, safeEnd);
          yieldedLength = safeEnd;
          if (out.length > 0) {
            const { masked } = detectPII(out, config);
            yield { content: masked, done: false } as AIStreamChunk;
          }
        }
      };

      for await (const chunk of gen) {
        if (chunk.content) {
          buffer += chunk.content;
          if (buffer.length > MAX_BUFFER) {
            // Defensive: if upstream misbehaves and we keep accumulating,
            // forcibly flush a portion so we don't OOM the client. We mask
            // the discarded portion in-place so PII is never exposed.
            const { masked } = detectPII(buffer, config);
            buffer = masked;
            const safeEnd = Math.max(0, buffer.length - WINDOW_SIZE);
            if (safeEnd > yieldedLength) {
              yield { content: buffer.slice(yieldedLength, safeEnd), done: false } as AIStreamChunk;
              yieldedLength = safeEnd;
            }
          }
          const iterator = tryFlush(false);
          for (const ev of iterator) yield ev as AIStreamChunk;
        } else if (!blockedEmitted) {
          yield chunk;
        }
      }

      // Final pass: re-mask the whole remaining buffer in case the last
      // WINDOW_SIZE chars contained a complete PII match that the rolling
      // pass couldn't yet see.
      const { masked: finalMasked } = detectPII(buffer, config);
      buffer = finalMasked;
      const finalIter = tryFlush(true);
      for (const ev of finalIter) yield ev as AIStreamChunk;
      yield { content: '', done: true } as AIStreamChunk;
    })();
  };
}

export function createContentFilterStreamMiddleware(
  config: ContentFilterConfig,
): ChatStreamMiddleware {
  return async ({ messages }, next) => {
    const maskedMessages: ChatMessage[] = messages.map((msg) => {
      if (msg.role === 'user') {
        const result = filterContent(msg.content ?? '', config);
        if (result.blocked) {
          return {
            ...msg,
            content: `[BLOCKED] ${result.reason ?? 'content filter'}`,
          };
        }
      }
      return msg;
    });
    const gen = await next(maskedMessages);
    return (async function* () {
      let buffer = '';
      const WINDOW = 128;
      let yielded = 0;
      let blocked = false;
      for await (const chunk of gen) {
        if (blocked) continue;
        if (!chunk.content) {
          yield chunk;
          continue;
        }
        buffer += chunk.content;
        // Inspect a sliding window for blocked patterns.
        if (filterContent(buffer, config).blocked) {
          blocked = true;
          yield { content: '[BLOCKED] content filter triggered', done: false } as AIStreamChunk;
          continue;
        }
        const safeEnd = Math.max(0, buffer.length - WINDOW);
        if (safeEnd > yielded) {
          yield { content: buffer.slice(yielded, safeEnd), done: false } as AIStreamChunk;
          yielded = safeEnd;
        }
      }
      if (!blocked && buffer.length > yielded) {
        yield { content: buffer.slice(yielded), done: false } as AIStreamChunk;
      }
      yield { content: '', done: true } as AIStreamChunk;
    })();
  };
}

export function createSecretDetectorStreamMiddleware(
  config: SecretDetectorConfig,
): ChatStreamMiddleware {
  return async ({ messages }, next) => {
    const maskedMessages: ChatMessage[] = messages.map((msg) => {
      if (config.blockOnDetection) {
        const { detected, names } = detectSecrets(msg.content ?? '', config);
        if (detected) {
          return {
            ...msg,
            content: `[BLOCKED] Secrets detected: ${names.join(', ')}`,
          };
        }
      }
      return msg;
    });
    const gen = await next(maskedMessages);
    return (async function* () {
      let buffer = '';
      const WINDOW = 320; // longest secret prefix in our patterns
      let yielded = 0;
      let blocked = false;
      for await (const chunk of gen) {
        if (blocked) continue;
        if (!chunk.content) {
          yield chunk;
          continue;
        }
        buffer += chunk.content;
        if (config.blockOnDetection) {
          const { detected } = detectSecrets(buffer, config);
          if (detected) {
            blocked = true;
            yield { content: '[BLOCKED] secret detected in stream', done: false } as AIStreamChunk;
            continue;
          }
        }
        const safeEnd = Math.max(0, buffer.length - WINDOW);
        if (safeEnd > yielded) {
          yield { content: buffer.slice(yielded, safeEnd), done: false } as AIStreamChunk;
          yielded = safeEnd;
        }
      }
      if (!blocked && buffer.length > yielded) {
        yield { content: buffer.slice(yielded), done: false } as AIStreamChunk;
      }
      yield { content: '', done: true } as AIStreamChunk;
    })();
  };
}

export function createSecretDetectorMiddleware(config: SecretDetectorConfig): ChatMiddleware {
  return async ({ messages }, next) => {
    for (const msg of messages) {
      const { detected, names } = detectSecrets(msg.content ?? '', config);
      if (detected && config.blockOnDetection) {
        return {
          content: `[BLOCKED] Secrets detected in message: ${names.join(', ')}. Remove sensitive data before sending.`,
          model: 'guardrails',
          provider: 'guardrails' as AIProviderType,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: 'stop',
        };
      }
    }
    return next(messages);
  };
}

export function createRateLimiterMiddleware(config: RateLimiterConfig): ChatMiddleware {
  const bucket = new TokenBucket(
    config.maxRequestsPerMinute ?? 60,
    (config.maxRequestsPerMinute ?? 60) / 60,
  );

  return async ({ messages }, next) => {
    const result = bucket.tryConsume(1);
    if (!result.allowed) {
      return {
        content: `[RATE LIMITED] Too many requests. Retry after ${result.retryAfterMs}ms.`,
        model: 'guardrails',
        provider: 'guardrails' as AIProviderType,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
      };
    }
    return next(messages);
  };
}

export function createAuditLoggerMiddleware(config: AuditLoggerConfig): ChatMiddleware {
  return async ({ messages, provider }, next) => {
    const response = await next(messages);
    if (config.enabled) {
      const userMsg = messages.find((m) => m.role === 'user');
      const entry: AuditEntry = {
        timestamp: Date.now(),
        role: 'user',
        contentLength: userMsg?.content?.length ?? 0,
        piiDetected: false,
        secretsDetected: false,
        contentBlocked: false,
        model: response.model,
        provider: provider?.type,
        tokensUsed: response.usage?.totalTokens,
        content: config.logContent ? userMsg?.content?.slice(0, 200) : undefined,
      };
      // Check for PII/secrets in audit
      for (const msg of messages) {
        const pii = detectPII(msg.content ?? '', { enabled: true });
        if (pii.detected) entry.piiDetected = true;
        const sec = detectSecrets(msg.content ?? '', { enabled: true });
        if (sec.detected) entry.secretsDetected = true;
      }
      if (config.handler) {
        config.handler(entry);
      }
    }
    return response;
  };
}

// --- Composed Guardrails ---

export function createGuardrailsMiddlewares(config: GuardrailsConfig): {
  chat: ChatMiddleware[];
  chatStream: ChatStreamMiddleware[];
} {
  const chat: ChatMiddleware[] = [];
  const chatStream: ChatStreamMiddleware[] = [];

  if (config.contentFilter?.enabled) {
    chat.push(createContentFilterMiddleware(config.contentFilter));
    chatStream.push(createContentFilterStreamMiddleware(config.contentFilter));
  }
  if (config.secretDetector?.enabled) {
    chat.push(createSecretDetectorMiddleware(config.secretDetector));
    chatStream.push(createSecretDetectorStreamMiddleware(config.secretDetector));
  }
  if (config.piiDetector?.enabled) {
    chat.push(createPIIDetectorMiddleware(config.piiDetector));
    chatStream.push(createPIIDetectorStreamMiddleware(config.piiDetector));
  }
  if (config.rateLimiter?.enabled) {
    chat.push(createRateLimiterMiddleware(config.rateLimiter));
  }
  if (config.auditLogger?.enabled) {
    chat.push(createAuditLoggerMiddleware(config.auditLogger));
  }

  return { chat, chatStream };
}
