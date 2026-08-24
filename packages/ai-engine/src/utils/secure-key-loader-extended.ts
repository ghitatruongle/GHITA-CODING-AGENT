// Built on top of SecureKeyLoader (secure-key-loader.ts):
//  - loadFromFile() / loadFromKeyring() (optional integrations)

//  - validateFormat() - check key shape

import { readFileSync } from 'node:fs';
import { SecureKeyLoader } from './secure-key-loader.js';

export interface KeyValidationResult {
  valid: boolean;
  reason?: string;
  
  provider: string;
  /** Detected key prefix (vd: 'sk-', 'sk-ant-', 'ghp_') */
  prefix?: string;
  /** Estimated entropy (key length) */
  entropy: number;
}

export interface KeyAccessLogEntry {
  timestamp: number;
  provider: string;
  action: 'load' | 'rotate' | 'clear' | 'validate' | 'not_found';
  source?: 'env' | 'keyring' | 'file' | 'cache';
  /** Redacted identifier, never the key itself */
  redactedIdentifier: string;
}

export interface KeyRotationResult {
  provider: string;
  oldKeyRedacted: string;
  newKeyRedacted: string;
  rotatedAt: number;
}

export class SecureKeyLoaderExtended {
  private accessLog: KeyAccessLogEntry[] = [];
  private maxLogSize = 500;
  /** Custom in-memory key storage (cho rotation) */
  private customKeys = new Map<string, string>();
  /** Known key prefixes cho validation */
  private static readonly PREFIX_PATTERNS: Array<{
    provider: string;
    pattern: RegExp;
    prefix: string;
  }> = [
    { provider: 'openai', pattern: /^sk-(?!ant-|proj-)[A-Za-z0-9_-]{20,}$/, prefix: 'sk-' },
    { provider: 'anthropic', pattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/, prefix: 'sk-ant-' },
    { provider: 'openai-proj', pattern: /^sk-proj-[A-Za-z0-9_-]{20,}$/, prefix: 'sk-proj-' },
    { provider: 'github', pattern: /^ghp_[A-Za-z0-9]{36,}$/, prefix: 'ghp_' },
    { provider: 'github-oauth', pattern: /^gho_[A-Za-z0-9]{36,}$/, prefix: 'gho_' },
    { provider: 'google', pattern: /^AIzaSy[A-Za-z0-9_-]{33}$/, prefix: 'AIzaSy' },
    { provider: 'xai', pattern: /^xai-[A-Za-z0-9_-]{20,}$/, prefix: 'xai-' },
  ];

  load(provider: string): string | undefined {
    const custom = this.customKeys.get(provider);
    if (custom) {
      this.logAccess(provider, 'load', 'cache', this.maskKey(custom));
      return custom;
    }
    const fromLoader = SecureKeyLoader.load(provider);
    if (fromLoader) {
      this.logAccess(provider, 'load', 'env', this.maskKey(fromLoader));
      return fromLoader;
    }
    this.logAccess(provider, 'not_found');
    return undefined;
  }

  /** Manually set a key (overrides env) */
  setKey(provider: string, key: string): void {
    this.customKeys.set(provider, key);
    this.logAccess(provider, 'rotate', 'cache', this.maskKey(key));
  }

  rotateKey(provider: string, newKey: string): KeyRotationResult | null {
    const old = this.load(provider);
    if (!old) {
      // No existing key - just set
      this.setKey(provider, newKey);
      return null;
    }
    this.customKeys.set(provider, newKey);
    return {
      provider,
      oldKeyRedacted: this.maskKey(old),
      newKeyRedacted: this.maskKey(newKey),
      rotatedAt: Date.now(),
    };
  }

  validateFormat(key: string): KeyValidationResult {
    for (const pat of SecureKeyLoaderExtended.PREFIX_PATTERNS) {
      if (pat.pattern.test(key)) {
        return {
          valid: true,
          provider: pat.provider,
          prefix: pat.prefix,
          entropy: key.length,
        };
      }
    }
    // Fallback: count entropy (>= 32 chars + has alphanum + mix of cases or digits)
    if (key.length >= 32 && /[a-zA-Z]/.test(key) && /[0-9]/.test(key)) {
      return {
        valid: true,
        reason: 'Unknown prefix, but length+entropy pass',
        provider: 'unknown',
        entropy: key.length,
      };
    }
    return {
      valid: false,
      reason: 'Key does not match any known provider prefix; insufficient entropy',
      provider: 'unknown',
      entropy: key.length,
    };
  }

  /** Load key from a file (e.g. ~/.ghita/keys/<provider>) - the file content is the key */
  loadFromFile(provider: string, filePath: string): string | undefined {
    try {
      const raw = readFileSync(filePath, 'utf8').trim();
      if (raw) {
        this.customKeys.set(provider, raw);
        this.logAccess(provider, 'load', 'file', this.maskKey(raw));
        return raw;
      }
    } catch {
      this.logAccess(provider, 'not_found', 'file');
    }
    return undefined;
  }

  clearKey(provider: string): boolean {
    const had = this.customKeys.delete(provider);
    if (had) this.logAccess(provider, 'clear', 'cache');
    return had;
  }

  /** Clear all custom keys */
  clearAll(): void {
    const providers = Array.from(this.customKeys.keys());
    this.customKeys.clear();
    for (const p of providers) this.logAccess(p, 'clear', 'cache');
  }

  /** Get access log (last N entries) */
  getAccessLog(limit = 50): KeyAccessLogEntry[] {
    return this.accessLog.slice(-limit);
  }

  /** Get stats */
  getStats(): {
    customKeys: number;
    envKeys: number;
    accessLogEntries: number;
    rotationCount: number;
  } {
    const rotationCount = this.accessLog.filter((e) => e.action === 'rotate').length;
    return {
      customKeys: this.customKeys.size,
      envKeys: this.accessLog.filter((e) => e.action === 'load' && e.source === 'env').length,
      accessLogEntries: this.accessLog.length,
      rotationCount,
    };
  }

  /** Redact an arbitrary string (inline implementation matching SecureKeyLoader.KEY_PATTERNS) */
  redactSecrets(input: string): string {
    const patterns: RegExp[] = [
      /sk-[A-Za-z0-9_-]{20,}/g,
      /sk-ant-[A-Za-z0-9_-]{20,}/g,
      /sk-proj-[A-Za-z0-9_-]{20,}/g,
      /ghp_[A-Za-z0-9_]{36,}/g,
      /gho_[A-Za-z0-9_]{36,}/g,
      /AIzaSy[A-Za-z0-9_-]{33}/g,
      /xai-[A-Za-z0-9_-]{20,}/g,
    ];
    let out = input;
    for (const p of patterns) out = out.replace(p, '[REDACTED]');
    return out;
  }

  /** Show masked version of a key (first 4 + last 4 chars) */
  maskKey(key: string): string {
    if (key.length <= 8) return '****';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  // --- Private ---

  private logAccess(
    provider: string,
    action: KeyAccessLogEntry['action'],
    source?: KeyAccessLogEntry['source'],
    redactedIdentifier = '',
  ): void {
    this.accessLog.push({ timestamp: Date.now(), provider, action, source, redactedIdentifier });
    if (this.accessLog.length > this.maxLogSize) {
      this.accessLog.splice(0, this.accessLog.length - this.maxLogSize);
    }
  }
}
