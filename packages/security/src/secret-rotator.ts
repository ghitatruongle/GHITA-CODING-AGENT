// ==============================================================================
// Phase 34: Secret Rotator — API key rotation helper
// ==============================================================================

import type { ApiKeyInfo, RotationEvent } from './types.js';

export interface SecretRotatorOptions {
  /** Default rotation interval (ms) */
  defaultRotationIntervalMs?: number;
  /** Logger */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
  /** Generator function để tạo key mới (vd: gọi provider API) */
  generateKey?: (provider: string) => Promise<string>;
  /** Revoke function */
  revokeKey?: (provider: string, keyId: string) => Promise<void>;
}

/**
 * SecretRotator — quản lý vòng đời API key + rotation tự động.
 *
 * Sử dụng:
 *   const rotator = new SecretRotator({
 *     defaultRotationIntervalMs: 90 * 86400_000,
 *     generateKey: async (provider) => callProviderApiToMint(provider),
 *     revokeKey: async (provider, keyId) => callProviderApiToRevoke(provider, keyId),
 *   });
 *   rotator.register({ id: 'k1', provider: 'openai', maskedKey: 'sk-...abc', ... });
 *   await rotator.tick(); // rotate các key đến hạn
 */
export class SecretRotator {
  private readonly keys = new Map<string, ApiKeyInfo>();
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
   * Đăng ký 1 key.
   */
  register(info: Omit<ApiKeyInfo, 'status' | 'rotationIntervalMs'> & { rotationIntervalMs?: number }): ApiKeyInfo {
    const full: ApiKeyInfo = {
      ...info,
      status: 'active',
      rotationIntervalMs: info.rotationIntervalMs ?? this.defaultRotationIntervalMs,
    };
    this.keys.set(info.id, full);
    return full;
  }

  /**
   * Lấy thông tin key.
   */
  get(id: string): ApiKeyInfo | undefined {
    return this.keys.get(id);
  }

  /**
   * Lấy tất cả key của provider.
   */
  listByProvider(provider: string): ApiKeyInfo[] {
    return Array.from(this.keys.values()).filter((k) => k.provider === provider);
  }

  /**
   * Lấy tất cả key sắp đến hạn rotation.
   */
  listDueForRotation(now = Date.now()): ApiKeyInfo[] {
    return Array.from(this.keys.values()).filter(
      (k) => k.status === 'active' && now - k.createdAt >= k.rotationIntervalMs,
    );
  }

  /**
   * Lấy tất cả key đã expired.
   */
  listExpired(now = Date.now()): ApiKeyInfo[] {
    return Array.from(this.keys.values()).filter((k) => k.expiresAt !== undefined && k.expiresAt <= now);
  }

  /**
   * Cập nhật last used timestamp.
   */
  touch(id: string): boolean {
    const k = this.keys.get(id);
    if (!k || k.status !== 'active') return false;
    k.lastUsedAt = Date.now();
    return true;
  }

  /**
   * Rotate 1 key (revoke cũ, tạo mới).
   */
  async rotate(id: string, reason?: string): Promise<RotationEvent> {
    const k = this.keys.get(id);
    if (!k) throw new Error(`Key ${id} not found`);

    k.status = 'rotating';
    this.onLog?.(`[Rotator] Rotating key ${id} (${k.provider})${reason ? ` — ${reason}` : ''}`, 'info');

    if (this.revokeKey) {
      try {
        await this.revokeKey(k.provider, k.id);
      } catch (err) {
        this.onLog?.(`[Rotator] revokeKey failed: ${(err as Error).message}`, 'warn');
      }
    }

    if (this.generateKey) {
      try {
        const newKey = await this.generateKey(k.provider);
        k.maskedKey = maskKey(newKey);
        k.createdAt = Date.now();
        k.status = 'active';
      } catch (err) {
        k.status = 'revoked';
        this.onLog?.(`[Rotator] generateKey failed, key ${id} marked revoked: ${(err as Error).message}`, 'error');
        const event: RotationEvent = {
          keyId: id,
          provider: k.provider,
          action: 'revoked',
          timestamp: Date.now(),
          reason: `rotate_failed: ${(err as Error).message}`,
        };
        this.totalRevocations++;
        return event;
      }
    } else {
      k.status = 'active';
      k.createdAt = Date.now();
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

  /**
   * Revoke 1 key vĩnh viễn.
   */
  async revoke(id: string, reason?: string): Promise<RotationEvent> {
    const k = this.keys.get(id);
    if (!k) throw new Error(`Key ${id} not found`);
    k.status = 'revoked';
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
    this.onLog?.(`[Rotator] Revoked key ${id} (${k.provider})${reason ? ` — ${reason}` : ''}`, 'warn');
    return event;
  }

  /**
   * Chạy 1 rotation tick — rotate tất cả key đến hạn, revoke expired.
   */
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
  stats(): { totalKeys: number; active: number; rotating: number; revoked: number; totalRotations: number; totalRevocations: number } {
    let active = 0, rotating = 0, revoked = 0;
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

/**
 * Mask API key — chỉ hiện prefix 4 ký tự + suffix 4 ký tự.
 */
export function maskKey(key: string): string {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
