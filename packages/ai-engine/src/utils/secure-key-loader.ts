// Securely loads API keys from environment variables with built-in redaction
// support to prevent key leakage through error messages, logs, or stack traces.

/**
 * Map of known API key environment variables by provider.
 * Keys are the provider type, values are the env var names to check in order.
 */
const API_KEY_ENV_MAP: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY', 'OPENAI_KEY'],
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_KEY'],
  deepseek: ['DEEPSEEK_API_KEY', 'DEEPSEEK_KEY'],
  groq: ['GROQ_API_KEY', 'GROQ_KEY'],
  mistral: ['MISTRAL_API_KEY', 'MISTRAL_KEY'],
  openrouter: ['OPENROUTER_API_KEY', 'OPENROUTER_KEY'],
};

/** Cached loaded keys — never logged or serialized */
const loadedKeys = new Map<string, string>();

/** Set of known key patterns for redaction */
const KEY_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /sk-proj-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9_]{36,}/g,
  /gho_[A-Za-z0-9_]{36,}/g,
  /AIzaSy[A-Za-z0-9_-]{33}/g,
  /xai-[A-Za-z0-9_-]{20,}/g,
  // Removed overly broad catch-all pattern that redacted UUIDs, hashes, etc.
];

export class SecureKeyLoader {
  /**
   * Load an API key for a given provider from environment variables.
   * Returns the key or undefined if not found.
   * The key is cached in memory but never exposed in logs or error messages.
   */
  static load(provider: string): string | undefined {
    const cached = loadedKeys.get(provider);
    if (cached) return cached;

    const envVars = API_KEY_ENV_MAP[provider];
    if (!envVars) return undefined;

    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value && value.length > 0) {
        loadedKeys.set(provider, value);
        return value;
      }
    }

    return undefined;
  }

  /**
   * Load all known API keys from environment variables at once.
   * Returns a record of provider -> key mappings.
   */
  static loadAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const provider of Object.keys(API_KEY_ENV_MAP)) {
      const key = SecureKeyLoader.load(provider);
      if (key) {
        result[provider] = key;
      }
    }
    return result;
  }

  /**
   * Check if a specific provider has a key configured.
   */
  static has(provider: string): boolean {
    return SecureKeyLoader.load(provider) !== undefined;
  }

  /**
   * Redact all known API key patterns from a string.
   * Use this to sanitize error messages, logs, or any output
   * that might accidentally contain sensitive key material.
   */
  static redactKeys(text: string): string {
    let sanitized = text;
    for (const pattern of KEY_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_API_KEY]');
    }
    return sanitized;
  }

  /**
   * Redact API keys from an Error object's message and stack trace.
   * Returns a safe error that can be logged or exposed.
   */
  static redactError(error: Error): Error {
    const safeMessage = SecureKeyLoader.redactKeys(error.message);
    const safeStack = error.stack ? SecureKeyLoader.redactKeys(error.stack) : undefined;
    const safe = new Error(safeMessage);
    safe.stack = safeStack;
    return safe;
  }

  /**
   * Clear all cached keys (useful for testing).
   */
  static clearCache(): void {
    loadedKeys.clear();
  }

  /**
   * Get the count of currently cached keys (useful for debugging).
   */
  static get cachedKeyCount(): number {
    return loadedKeys.size;
  }
}
