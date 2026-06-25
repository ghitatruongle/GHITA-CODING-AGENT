// ==============================================================================
// GHITA CODING AGENT - Channel Plugin Contract (Phase 8)
// Kế thừa đặc tả OpenClaw plugin contract
// ==============================================================================

/** Health check result for a channel adapter */
export interface ChannelHealthStatus {
  /** Channel ID */
  channelId: string;
  /** Whether the channel is connected and operational */
  connected: boolean;
  /** Latency of the health probe in ms */
  latencyMs: number;
  /** Human-readable status message */
  message: string;
  /** Timestamp of the check */
  checkedAt: number;
}

/**
 * Adapter cho một channel cụ thể (Telegram, Discord, Slack, etc.)
 */
export interface ChannelAdapter {
  id: string;
  sendMessage(channelId: string, text: string): Promise<boolean>;
  onMessage(handler: (message: unknown) => void | Promise<void>): void;
  handleWebhook?(req: unknown, res: unknown): Promise<void> | void;
  /** Probe the channel's connection health. Returns a status report. */
  healthCheck?(): Promise<ChannelHealthStatus>;
}

/**
 * Đặc tả Channel Plugin Entry
 */
export interface ChannelPluginEntry {
  id: string;
  configSchema: Record<string, unknown>;
  adapters: Record<string, ChannelAdapter>;
}

/**
 * Định nghĩa channel entry helper (OpenClaw style factory)
 */
export function defineChannelEntry(entry: ChannelPluginEntry): ChannelPluginEntry {
  return entry;
}

/**
 * Bộ quản lý các channel plugin được đăng ký
 */
export class ChannelPluginRegistry {
  private readonly channels = new Map<string, ChannelPluginEntry>();

  registerChannel(channel: ChannelPluginEntry): void {
    if (this.channels.has(channel.id)) {
      console.warn(`[Channel Registry] Overwriting existing channel plugin: ${channel.id}`);
    }
    this.channels.set(channel.id, channel);
    console.info(`[Channel Registry] Registered channel plugin: ${channel.id}`);
  }

  unregisterChannel(id: string): boolean {
    return this.channels.delete(id);
  }

  getChannel(id: string): ChannelPluginEntry | undefined {
    return this.channels.get(id);
  }

  listChannels(): ChannelPluginEntry[] {
    return Array.from(this.channels.values());
  }

  /**
   * Auto-discover available channels by probing health on all registered adapters.
   * Returns a map of channelId → health status for each probe.
   */
  async discoverAvailable(timeoutMs = 5000): Promise<Map<string, ChannelHealthStatus>> {
    const results = new Map<string, ChannelHealthStatus>();
    const probes: Promise<void>[] = [];

    for (const [id, entry] of this.channels) {
      for (const [adapterName, adapter] of Object.entries(entry.adapters)) {
        const key = `${id}:${adapterName}`;
        const healthCheck = adapter.healthCheck;
        if (healthCheck) {
          const probe = new Promise<void>((resolve) => {
            const probeStart = Date.now();
            const timer = setTimeout(() => {
              results.set(key, {
                channelId: key,
                connected: false,
                latencyMs: timeoutMs,
                message: 'Health check timed out',
                checkedAt: Date.now(),
              });
              resolve();
            }, timeoutMs);
            healthCheck()
              .then((status) => {
                clearTimeout(timer);
                results.set(key, status);
              })
              .catch(() => {
                clearTimeout(timer);
                results.set(key, {
                  channelId: key,
                  connected: false,
                  latencyMs: Date.now() - probeStart,
                  message: 'Health check threw an error',
                  checkedAt: Date.now(),
                });
              })
              .finally(() => resolve());
          });
          probes.push(probe);
        } else {
          // No healthCheck method - assume available
          results.set(key, {
            channelId: key,
            connected: true,
            latencyMs: 0,
            message: 'No health check available (assumed available)',
            checkedAt: Date.now(),
          });
        }
      }
    }

    await Promise.all(probes);
    return results;
  }
}

/**
 * FIFO Queue Runner để bảo đảm xử lý tuần tự cho mỗi session (Per-session FIFO Lane)
 */
export class FifoQueue {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;

  async enqueue(fn: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await fn();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (e) {
          console.error('[FifoQueue] Task execution failed:', e);
        }
      }
    }

    this.processing = false;
  }
}

/**
 * Quản lý FIFO lanes theo session/channel ID
 */
export class FifoLaneManager {
  private readonly lanes = new Map<string, FifoQueue>();

  getLane(sessionId: string): FifoQueue {
    let lane = this.lanes.get(sessionId);
    if (!lane) {
      lane = new FifoQueue();
      this.lanes.set(sessionId, lane);
    }
    return lane;
  }

  clearLane(sessionId: string): boolean {
    return this.lanes.delete(sessionId);
  }
}

/**
 * Unified Plugin API cho bên thứ ba đăng ký Tool, Command và Channel
 */
export interface PluginApi {
  registerTool(
    name: string,
    definition: unknown,
    execute: (args: unknown) => Promise<unknown>,
  ): void;
  registerCommand(name: string, execute: (args: unknown) => Promise<unknown>): void;
  registerChannel(channel: ChannelPluginEntry): void;
}
