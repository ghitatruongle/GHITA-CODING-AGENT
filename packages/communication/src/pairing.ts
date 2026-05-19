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
   * Validate a code submitted by mobile device
   */
  validate(code: string): boolean {
    if (Date.now() >= this.expiresAt) {
      return false; // Code expired
    }
    return code.toUpperCase() === this.currentCode;
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
    this.stopAutoRefresh();
    this.onCodeChange = undefined;
  }
}
