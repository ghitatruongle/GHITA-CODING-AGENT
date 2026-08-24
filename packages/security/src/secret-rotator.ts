import type { ApiKeyInfo, RotationEvent } from './types.js';

export interface SecretRotatorOptions {
  /** Default rotation interval (ms) */
  defaultRotationIntervalMs?: number;
  /** Logger */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
  
  generateKey?: (provider: string) => Promise<string>;
  /** Revoke function */
  revokeKey?: (provider: string, keyId: string) => Promise<void>;
}

/**

 *

 *   const rotator = new SecretRotator({
 *     defaultRotationIntervalMs: 90 * 86400_000,
 *     generateKey: async (provider) => callProviderApiToMint(provider),
 *     revokeKey: async (provider, keyId) => callProviderApiToRevoke(provider, keyId),
 *   });
 *   rotator.register({ id: 'k1', provider: 'openai', maskedKey: 'sk-...abc', ... });

 */
export class SecretRotator {
  private readonly keys = new Map<string, ApiKeyInfo>();
  /**
   * Separate in-memory store of the actual (unmasked) key material.
   *
   * SECURITY (audit fix 2.11): previously the rotator would call
   * `maskKey(newKey)` and assign the masked form to `ApiKeyInfo.maskedKey`
   * while discarding the original `newKey` — meaning no consumer could
   * ever use the freshly rotated credential. We now keep the real key
   * here (in-memory only, never persisted, never returned in lists) and
   * expose it via `getActiveKey()`. External secret stores (e.g. OS
   * keychain) are a recommended follow-up to take this off the heap.
   */
  private readonly unmasked = new Map<string, string>();
  private readonly defaultRotationIntervalMs: number;
  private readonly onLog?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
  private readonly generateKey?: (provider: string) => Promise<string>;
  private readonly revokeKey?: (provider: string, keyId: string) => Promise<void>;
  private totalRotations = 0;
  private totalRevocations = 0;

  constructor(options: SecretRotatorOptions = {}) {
    this.defaultRotationIntervalMs = options.defaultRotationIntervalMs ?? 90 * 86400_000;
    this.onLog = options.logger;
    this.generateKey = options.generateKey;
    this.revokeKey = options.revokeKey;
  }

  /**

   *
   * @param info Metadata. Pass `unmaskedKey` alongside `maskedKey` so the
   *              rotator can hand the real credential to consumers via
   *              `getActiveKey()`. If omitted, only the masked form is
   *              available (suitable for read-only audit use).
   */
  register(
    info: Omit<ApiKeyInfo, 'status' | 'rotationIntervalMs'> & {
      rotationIntervalMs?: number;
      unmaskedKey?: string;
    },
  ): ApiKeyInfo {
    const full: ApiKeyInfo = {
      ...info,
      status: 'active',
      rotationIntervalMs: info.rotationIntervalMs ?? this.defaultRotationIntervalMs,
    };
    this.keys.set(info.id, full);
    if (info.unmaskedKey) {
      this.unmasked.set(info.id, info.unmaskedKey);
    }
    return full;
  }

  get(id: string): ApiKeyInfo | undefined {
    return this.keys.get(id);
  }

  getActiveKey(id: string): string | undefined {
    const k = this.keys.get(id);
    if (!k || k.status !== 'active') return undefined;
    return this.unmasked.get(id);
  }

  listByProvider(provider: string): ApiKeyInfo[] {
    return Array.from(this.keys.values()).filter((k) => k.provider === provider);
  }

  listDueForRotation(now = Date.now()): ApiKeyInfo[] {
    return Array.from(this.keys.values()).filter(
      (k) => k.status === 'active' && now - k.createdAt >= k.rotationIntervalMs,
    );
  }

  listExpired(now = Date.now()): ApiKeyInfo[] {
    return Array.from(this.keys.values()).filter(
      (k) => k.expiresAt !== undefined && k.expiresAt <= now,
    );
  }

  touch(id: string): boolean {
    const k = this.keys.get(id);
    if (!k || k.status !== 'active') return false;
    k.lastUsedAt = Date.now();
    return true;
  }

  async rotate(id: string, reason?: string): Promise<RotationEvent> {
    const k = this.keys.get(id);
    if (!k) throw new Error(`Key ${id} not found`);

    k.status = 'rotating';
    this.onLog?.(
      `[Rotator] Rotating key ${id} (${k.provider})${reason ? ` — ${reason}` : ''}`,
      'info',
    );

    // Step 1: Generate new key FIRST so the old key remains valid if generation fails
    if (this.generateKey) {
      try {
        const newKey = await this.generateKey(k.provider);
        k.maskedKey = maskKey(newKey);
        // SECURITY (audit fix 2.11): also store the unmasked form so
        // `getActiveKey()` can hand it to the HTTP client. Without this
        // line the freshly rotated credential would be unreachable.
        this.unmasked.set(id, newKey);
        k.createdAt = Date.now();
        k.status = 'active';
      } catch (err) {
        // Generation failed — old key is still active, do NOT revoke
        k.status = 'active';
        this.onLog?.(
          `[Rotator] generateKey failed, key ${id} kept active: ${(err as Error).message}`,
          'error',
        );
        const event: RotationEvent = {
          keyId: id,
          provider: k.provider,
          action: 'rotated',
          timestamp: Date.now(),
          reason: `generate_failed:${(err as Error).message}`,
        };
        return event;
      }
    } else {
      k.status = 'active';
      k.createdAt = Date.now();
    }

    // Step 2: Revoke old key AFTER successful generation
    if (this.revokeKey) {
      try {
        await this.revokeKey(k.provider, k.id);
      } catch (err) {
        this.onLog?.(
          `[Rotator] revokeKey failed (new key is active): ${(err as Error).message}`,
          'warn',
        );
      }
    }

    this.totalRotations++;
    const event: RotationEvent = {
      keyId: id,
      provider: k.provider,
      action: 'rotated',
      timestamp: Date.now(),
      ...(reason !== undefined ? { reason } : {}),
    };
    return event;
  }

  async revoke(id: string, reason?: string): Promise<RotationEvent> {
    const k = this.keys.get(id);
    if (!k) throw new Error(`Key ${id} not found`);
    k.status = 'revoked';
    // Drop the unmasked form from memory once revoked.
    this.unmasked.delete(id);
    if (this.revokeKey) {
      try {
        await this.revokeKey(k.provider, k.id);
      } catch (err) {
        this.onLog?.(`[Rotator] revokeKey failed: ${(err as Error).message}`, 'warn');
      }
    }
    this.totalRevocations++;
    const event: RotationEvent = {
      keyId: id,
      provider: k.provider,
      action: 'revoked',
      timestamp: Date.now(),
      ...(reason !== undefined ? { reason } : {}),
    };
    this.onLog?.(
      `[Rotator] Revoked key ${id} (${k.provider})${reason ? ` — ${reason}` : ''}`,
      'warn',
    );
    return event;
  }

  async tick(): Promise<RotationEvent[]> {
    const events: RotationEvent[] = [];
    for (const k of this.listExpired()) {
      events.push(await this.revoke(k.id, 'expired'));
    }
    for (const k of this.listDueForRotation()) {
      events.push(await this.rotate(k.id, 'scheduled'));
    }
    return events;
  }

  /**
   * Stats.
   */
  stats(): {
    totalKeys: number;
    active: number;
    rotating: number;
    revoked: number;
    totalRotations: number;
    totalRevocations: number;
  } {
    let active = 0,
      rotating = 0,
      revoked = 0;
    for (const k of this.keys.values()) {
      if (k.status === 'active') active++;
      else if (k.status === 'rotating') rotating++;
      else if (k.status === 'revoked') revoked++;
    }
    return {
      totalKeys: this.keys.size,
      active,
      rotating,
      revoked,
      totalRotations: this.totalRotations,
      totalRevocations: this.totalRevocations,
    };
  }
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
