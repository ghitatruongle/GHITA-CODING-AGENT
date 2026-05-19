// ==============================================================================
// GHITA CODING AGENT - Screen Capture
// Captures desktop screen and streams as base64 JPEG over Socket.io
// ==============================================================================

import type { ScreenStreamConfig } from './types.js';

const DEFAULT_CONFIG: ScreenStreamConfig = {
  quality: 60,
  interval: 1000,
  maxWidth: 1280,
};

export class ScreenCapture {
  private config: ScreenStreamConfig;
  private streamTimer: ReturnType<typeof setInterval> | null = null;
  private isStreaming = false;
  private onFrame?: (imageBase64: string) => void;

  constructor(config: Partial<ScreenStreamConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Capture a single screenshot and return as base64
   */
  async captureScreen(): Promise<string> {
    try {
      // Dynamic import to avoid bundling native module in frontend
      const screenshotModule = await import('screenshot-desktop');
      const screenshot = screenshotModule.default ?? screenshotModule;

      const imgBuffer: Buffer = await screenshot({ format: 'jpg' });
      return imgBuffer.toString('base64');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCapture] Failed to capture screen:', message);
      throw new Error(`Screen capture failed: ${message}`);
    }
  }

  /**
   * Start continuous screen streaming
   * @param onFrame - Callback with base64 image data for each frame
   */
  startStream(onFrame: (imageBase64: string) => void): void {
    if (this.isStreaming) {
      this.stopStream();
    }

    this.onFrame = onFrame;
    this.isStreaming = true;

    // Capture immediately, then on interval
    void this.emitFrame();

    this.streamTimer = setInterval(() => {
      void this.emitFrame();
    }, this.config.interval);
  }

  /**
   * Stop continuous screen streaming
   */
  stopStream(): void {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
    this.isStreaming = false;
    this.onFrame = undefined;
  }

  /**
   * Update stream configuration
   */
  updateConfig(config: Partial<ScreenStreamConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart stream with new config if currently streaming
    if (this.isStreaming && this.onFrame) {
      const currentCallback = this.onFrame;
      this.stopStream();
      this.startStream(currentCallback);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ScreenStreamConfig {
    return { ...this.config };
  }

  /**
   * Check if currently streaming
   */
  get streaming(): boolean {
    return this.isStreaming;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopStream();
  }

  // --- Private ---

  private async emitFrame(): Promise<void> {
    if (!this.isStreaming || !this.onFrame) return;

    try {
      const base64 = await this.captureScreen();
      this.onFrame(base64);
    } catch {
      // Silently skip frame on capture failure — don't crash the stream
    }
  }
}
