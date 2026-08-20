// ==============================================================================
// GHITA CODING AGENT - Track 3 (v1.1.5-beta1): PauseToken
// ==============================================================================
// Cooperative pause/resume/cancel token for long-running indexing operations.
// ==============================================================================

export class PauseToken {
  private _isPaused = false;
  private _isCancelled = false;
  private _resumePromise: Promise<void> | null = null;
  private _resolveResume: (() => void) | null = null;

  /**
   * Whether indexing is currently paused.
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Whether indexing has been cancelled.
   */
  get isCancelled(): boolean {
    return this._isCancelled;
  }

  /**
   * Pause indexing cooperatively.
   */
  pause(): void {
    if (this._isPaused || this._isCancelled) return;
    this._isPaused = true;
    this._resumePromise = new Promise<void>((resolve) => {
      this._resolveResume = resolve;
    });
  }

  /**
   * Resume indexing.
   */
  resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    if (this._resolveResume) {
      this._resolveResume();
      this._resolveResume = null;
      this._resumePromise = null;
    }
  }

  /**
   * Cancel indexing. Unblocks any waiting loops so they can throw/exit immediately.
   */
  cancel(): void {
    this._isCancelled = true;
    this.resume();
  }

  /**
   * Awaits until resumed if paused. Throws if cancelled.
   */
  async waitIfPaused(): Promise<void> {
    if (this._isCancelled) {
      throw new Error('Indexing cancelled by PauseToken');
    }
    if (this._isPaused && this._resumePromise) {
      await this._resumePromise;
    }
    if (this._isCancelled) {
      throw new Error('Indexing cancelled by PauseToken');
    }
  }

  /**
   * Throws immediately if cancelled.
   */
  throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new Error('Indexing cancelled by PauseToken');
    }
  }
}
