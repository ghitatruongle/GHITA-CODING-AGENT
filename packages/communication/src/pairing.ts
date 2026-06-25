// ==============================================================================
// GHITA CODING AGENT - Pairing Manager
// 6-character code-based 2-way authentication between Desktop ↔ Mobile
// ==============================================================================

import { generatePairingCode } from '@ghita/shared';
import type { PairingState } from './types.js';

const DEFAULT_TTL_MS = 300_000; // 5 minutes

export class PairingManager {
  private currentCode: string;
  private expiresAt: number;
  private ttlMs: number;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private onCodeChange?: (code: string) => void;
  private disposed = false;
  private failedAttempts = 0;
  private lockoutUntil = 0;
  private readonly maxFailedAttempts = 10;
  private readonly lockoutDurationMs = 5 * 60 * 1000; // 5 min lockout

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.currentCode = generatePairingCode();
    this.expiresAt = Date.now() + this.ttlMs;
  }

  /**
   * Get the current pairing state
   */
  getState(): PairingState {
    return {
      code: this.currentCode,
      expiresAt: this.expiresAt,
      isActive: Date.now() < this.expiresAt,
    };
  }

  /**
   * Get the current active code
   */
  getCode(): string {
    if (Date.now() >= this.expiresAt) {
      this.regenerate();
    }
    return this.currentCode;
  }

  /**
   * Validate a code submitted by mobile device.
   * Enforces rate limiting: lockout after maxFailedAttempts within TTL window.
   */
  validate(code: string): boolean {
    const now = Date.now();

    // Check lockout
    if (now < this.lockoutUntil) {
      return false;
    }

    if (now >= this.expiresAt) {
      return false; // Code expired
    }

    if (code.toUpperCase() === this.currentCode) {
      this.failedAttempts = 0; // Reset on success
      return true;
    }

    this.failedAttempts++;
    if (this.failedAttempts >= this.maxFailedAttempts) {
      this.lockoutUntil = now + this.lockoutDurationMs;
      this.failedAttempts = 0;
    }
    return false;
  }

  /**
   * Generate a new code (manual refresh or auto-expire)
   */
  regenerate(): string {
    this.currentCode = generatePairingCode();
    this.expiresAt = Date.now() + this.ttlMs;
    this.onCodeChange?.(this.currentCode);
    return this.currentCode;
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh(onChange?: (code: string) => void): void {
    if (this.disposed) return;
    this.onCodeChange = onChange;
    this.stopAutoRefresh();

    this.refreshTimer = setInterval(() => {
      if (Date.now() >= this.expiresAt) {
        this.regenerate();
      }
    }, 10_000); // Check every 10 seconds
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Get remaining TTL in milliseconds
   */
  getRemainingMs(): number {
    return Math.max(0, this.expiresAt - Date.now());
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.disposed = true;
    this.stopAutoRefresh();
    this.onCodeChange = undefined;
  }
}
