import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChannelAdapter, ChannelHealthStatus } from '../channel-plugin-contract.js';

const execFileAsync = promisify(execFile);

const SAFE_CHANNEL_RE = /^[\w\-\s+@.]+$/;

function assertSafeChannelId(id: string): void {
  if (!SAFE_CHANNEL_RE.test(id)) {
    throw new Error(`Invalid channel ID: contains disallowed characters`);
  }
}

export class IMessageAdapter implements ChannelAdapter {
  readonly id = 'imessage';
  private messageHandler?: (message: unknown) => void | Promise<void>;
  private isWatching = false;
  private watchInterval: NodeJS.Timeout | null = null;
  private chatDbPath = '';
  private lastRowId = 0;

  constructor(options?: { chatDbPath?: string }) {
    if (options?.chatDbPath) {
      this.chatDbPath = options.chatDbPath;
    }
  }

  onMessage(handler: (message: unknown) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Send outbound iMessage via AppleScript (macOS).
   */
  async sendMessage(channelId: string, text: string): Promise<boolean> {
    assertSafeChannelId(channelId);
    const isDarwin = process.platform === 'darwin';

    if (isDarwin) {
      try {
        // Safe escaping of quotes for AppleScript
        const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "Messages" to send "${escapedText}" to buddy "${channelId}"`;
        // P1-9 (deep review pass #2): keeps the rest of the codebase's
        // windowsHide consistency. macOS ignores this flag (it's a no-op).
        await execFileAsync('osascript', ['-e', script], { windowsHide: true });
        return true;
      } catch (error) {
        console.error('[IMessageAdapter] macOS osascript send failed:', error);
        return false;
      }
    }

    // v0.8.0: on non-macOS there is no real iMessage transport. Previously this
    // returned "MOCK_OK" / true — reporting a message as sent when nothing was
    // sent. Return an honest failure instead.
    console.warn(
      '[IMessageAdapter] Cannot send iMessage: requires macOS. Non-macOS sends are not supported.',
    );
    return false;
  }

  /**
   * Start checking for new incoming iMessages.
   */
  async start(): Promise<void> {
    this.isWatching = true;
    const isDarwin = process.platform === 'darwin';

    if (!isDarwin) {
      // v0.8.0: honestly report that iMessage watching is unavailable rather
      // than silently claiming a "mock/simulation mode" that never delivers.
      console.warn('[IMessageAdapter] iMessage is only available on macOS.');
      this.isWatching = false;
      return;
    }

    // Attempt to seed the initial lastRowId
    const dbPath = this.chatDbPath || `${process.env.HOME}/Library/Messages/chat.db`;
    try {
      const { stdout } = await execFileAsync(
        'sqlite3',
        [dbPath, 'SELECT MAX(ROWID) FROM message;'],
        { windowsHide: true },
      );
      this.lastRowId = parseInt(stdout.trim(), 10) || 0;
    } catch {
      this.lastRowId = 0;
    }

    this.startDbPoller(dbPath);
  }

  /**
   * Stop checking for new incoming messages.
   */
  async stop(): Promise<void> {
    this.isWatching = false;
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  /**
   * Poll chat.db SQLite database for new incoming messages
   */
  private startDbPoller(dbPath: string): void {
    this.watchInterval = setInterval(async () => {
      if (!this.isWatching) return;

      try {
        const query = `SELECT message.ROWID, message.text, handle.id FROM message JOIN handle ON message.handle_id = handle.ROWID WHERE message.is_from_me = 0 AND message.ROWID > ${this.lastRowId} ORDER BY message.ROWID ASC;`;

        const { stdout } = await execFileAsync('sqlite3', [dbPath, query], {
          windowsHide: true,
        });
        if (stdout.trim()) {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            const parts = line.split('|');
            const rowid = parseInt(parts[0] || '0', 10);
            const text = parts[1] || '';
            const sender = parts[2] || '';

            if (rowid > this.lastRowId) {
              this.lastRowId = rowid;
              if (this.messageHandler) {
                await this.messageHandler({
                  id: rowid.toString(),
                  text,
                  sender,
                  timestamp: Date.now(),
                });
              }
            }
          }
        }
      } catch (error) {
        // Fail silently to prevent console spam
      }
    }, 3000);
  }

  /**
   * Test-only helper to simulate receiving an iMessage
   */
  simulateMessage(sender: string, text: string): void {
    if (this.messageHandler) {
      void this.messageHandler({
        id: `imsg_${Date.now()}`,
        text,
        sender,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Probe iMessage connection health (macOS availability check).
   */
  async healthCheck(): Promise<ChannelHealthStatus> {
    const start = Date.now();
    const isDarwin = process.platform === 'darwin';
    const watching = this.isWatching;

    return {
      channelId: this.id,
      connected: isDarwin && watching,
      latencyMs: Date.now() - start,
      message: !isDarwin
        ? 'iMessage not available (non-macOS)'
        : watching
          ? 'iMessage DB watcher active'
          : 'iMessage watcher not started',
      checkedAt: Date.now(),
    };
  }
}
