// ==============================================================================
// GHITA CODING AGENT - WebSocket Reconnect Strategy (Phase 29)
// ==============================================================================

import type { ReconnectConfig } from './types.js';

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  enabled: true,
  initialDelay: 1000,
  maxDelay: 30_000,
  backoffMultiplier: 2,
  maxAttempts: 0, // infinite
  jitter: 0.1,
  resetAfter: 60_000,
};

/**
 * Reconnect manager with exponential backoff and jitter.
 * Controls reconnection attempts after WebSocket disconnection.
 */
export class ReconnectStrategy {
  private config: ReconnectConfig;
  private _attempts = 0;
  private _lastAttemptTime = 0;
  private _lastConnectedTime = 0;
  private _currentDelay: number;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _aborted = false;

  constructor(config?: Partial<ReconnectConfig>) {
    this.config = { ...DEFAULT_RECONNECT_CONFIG, ...config };
    this._currentDelay = this.config.initialDelay;
  }

  /**
   * Calculate the next reconnect delay.
   * Returns delay in ms, or -1 if max attempts exceeded.
   */
  nextDelay(): number {
    if (!this.config.enabled) return -1;
    if (this._aborted) return -1;
    if (this.config.maxAttempts > 0 && this._attempts >= this.config.maxAttempts) return -1;

    this._attempts++;
    this._lastAttemptTime = Date.now();

    // Exponential backoff
    const baseDelay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this._attempts - 1),
      this.config.maxDelay,
    );

    // Add jitter
    const jitterAmount = baseDelay * this.config.jitter;
    const jitter = (Math.random() * 2 - 1) * jitterAmount; // Random between -jitter and +jitter
    this._currentDelay = Math.max(0, Math.round(baseDelay + jitter));

    return this._currentDelay;
  }

  /**
   * Schedule a reconnect callback.
   * Returns the delay in ms, or -1 if not scheduled.
   */
  schedule(callback: () => void): number {
    this.cancel(); // Cancel any existing timer

    const delay = this.nextDelay();
    if (delay < 0) return -1;

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      callback();
    }, delay);

    // Allow process to exit
    if (
      this._reconnectTimer &&
      typeof this._reconnectTimer === 'object' &&
      'unref' in this._reconnectTimer
    ) {
      this._reconnectTimer.unref();
    }

    return delay;
  }

  /**
   * Cancel pending reconnect timer.
   */
  cancel(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * Abort further reconnection attempts.
   */
  abort(): void {
    this._aborted = true;
    this.cancel();
  }

  /**
   * Reset attempt count (e.g., after stable connection).
   */
  reset(): void {
    this._attempts = 0;
    this._currentDelay = this.config.initialDelay;
    this._aborted = false;
  }

  /**
   * Called when connection is established successfully.
   * Starts the reset timer.
   */
  onConnected(resetCallback?: () => void): void {
    this._lastConnectedTime = Date.now();
    this._attempts = 0;
    this._currentDelay = this.config.initialDelay;
    this._aborted = false;

    // Schedule auto-reset after stable period
    if (this.config.resetAfter > 0 && resetCallback) {
      const timer = setTimeout(() => {
        resetCallback();
      }, this.config.resetAfter);
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
    }
  }

  get attempts(): number {
    return this._attempts;
  }

  get currentDelay(): number {
    return this._currentDelay;
  }

  get aborted(): boolean {
    return this._aborted;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  get lastAttemptTime(): number {
    return this._lastAttemptTime;
  }

  get lastConnectedTime(): number {
    return this._lastConnectedTime;
  }

  /**
   * Destroy and clean up.
   */
  destroy(): void {
    this.cancel();
    this._aborted = true;
  }
}
