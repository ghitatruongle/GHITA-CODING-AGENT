import type { ChannelAdapter, ChannelHealthStatus } from '../channel-plugin-contract.js';
import { safeFetch } from '../utils/security.js';

interface GrammyBot {
  on(event: string, cb: (ctx: { message: unknown }) => void): void;
  start(): void;
  stop(): Promise<void>;
}

export class TelegramAdapter implements ChannelAdapter {
  readonly id = 'telegram';
  private token: string;
  private messageHandler?: (message: unknown) => void | Promise<void>;
  private isPolling = false;
  private offset = 0;
  private pollTimeout: NodeJS.Timeout | null = null;
  private messageQueue: { channelId: string; text: string; resolve: (val: boolean) => void }[] = [];
  private sending = false;
  private throttleMs = 1000; // Throttle to 1 message per second in production
  private lastSentTime = 0;
  private grammyBot: GrammyBot | null = null;

  constructor(token: string, options?: { throttleMs?: number }) {
    this.token = token;
    if (options?.throttleMs !== undefined) {
      this.throttleMs = options.throttleMs;
    }
  }

  onMessage(handler: (message: unknown) => void | Promise<void>): void {
    this.messageHandler = handler;
    if (this.grammyBot) {
      this.grammyBot.on('message', async (ctx: { message: unknown }) => {
        if (this.messageHandler) {
          await this.messageHandler(ctx.message);
        }
      });
    }
  }

  /**
   * Send a message to Telegram channel. Handles HTML rendering, length splitting, and rate throttling.
   */
  async sendMessage(channelId: string, text: string): Promise<boolean> {
    // Outbound length split (Telegram max length is 4096)
    const chunks = this.splitText(text, 4096);
    let allSuccess = true;

    for (const chunk of chunks) {
      const success = await this.queueMessage(channelId, chunk);
      if (!success) {
        allSuccess = false;
      }
    }

    return allSuccess;
  }

  /**
   * Start long-poll worker (tries grammY first, then falls back to native poll loop)
   */
  async start(): Promise<void> {
    this.isPolling = true;
    try {
      // Attempt to load grammY dynamically
      const moduleName = 'grammy';
      const { Bot } = await import(moduleName);
      this.grammyBot = new Bot(this.token);
      if (this.grammyBot && this.messageHandler) {
        const handler = this.messageHandler;
        this.grammyBot.on('message', async (ctx: { message: unknown }) => {
          await handler(ctx.message);
        });
      }
      // Start polling via grammy in background
      if (this.grammyBot) {
        void this.grammyBot.start();
      }
      console.info('[TelegramAdapter] Started via grammY Bot client');
    } catch {
      // Fallback: Custom Native Long Polling
      console.info('[TelegramAdapter] grammY not available. Falling back to native long-poll.');
      void this.pollLoop();
    }
  }

  /**
   * Stop long-poll worker
   */
  async stop(): Promise<void> {
    this.isPolling = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    if (this.grammyBot) {
      try {
        await this.grammyBot.stop();
      } catch {
        // Ignore stop error
      }
      this.grammyBot = null;
    }
  }

  /**
   * Webhook handler helper (standard express-like req/res)
   */
  async handleWebhook(
    req: { body?: { message?: unknown } },
    res: { status: (code: number) => { send: (msg: string) => void } },
  ): Promise<void> {
    const body = req.body;
    if (body && body.message && this.messageHandler) {
      try {
        await this.messageHandler(body.message);
      } catch (err) {
        console.error('[TelegramAdapter] Webhook message processing error:', err);
      }
    }
    if (res && typeof res.status === 'function') {
      res.status(200).send('OK');
    }
  }

  /**
   * Internal long poll loop using safeFetch
   */
  private async pollLoop(): Promise<void> {
    if (!this.isPolling) return;
    if (!this.token || this.token.startsWith('MOCK_')) {
      // Simulate polling interval for mock tokens in testing
      this.pollTimeout = setTimeout(() => this.pollLoop(), 1000);
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`;
      const response = await safeFetch(url);
      if (response.ok) {
        const data = (await response.json()) as {
          ok?: boolean;
          result?: Array<{ update_id: number; message?: unknown }>;
        };
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = Math.max(this.offset, update.update_id + 1);
            if (update.message && this.messageHandler) {
              try {
                await this.messageHandler(update.message);
              } catch (err) {
                console.error('[TelegramAdapter] Error handling polled message:', err);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[TelegramAdapter] Polling error:', error);
      // Wait longer before retry on error
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (this.isPolling) {
      this.pollTimeout = setTimeout(() => this.pollLoop(), 100);
    }
  }

  /**
   * Enqueues a message for throttled transmission
   */
  private queueMessage(channelId: string, text: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.messageQueue.push({ channelId, text, resolve });
      void this.processQueue();
    });
  }

  /**
   * Processes the message queue respecting rate limits
   */
  private async processQueue(): Promise<void> {
    if (this.sending) return;
    if (this.messageQueue.length === 0) return;

    this.sending = true;

    while (this.messageQueue.length > 0) {
      const next = this.messageQueue[0];
      if (!next) break;

      const now = Date.now();
      const elapsed = now - this.lastSentTime;
      if (elapsed < this.throttleMs) {
        const wait = this.throttleMs - elapsed;
        await new Promise((r) => setTimeout(r, wait));
      }

      const success = await this.sendHttpRequest(next.channelId, next.text);
      this.lastSentTime = Date.now();
      next.resolve(success);

      this.messageQueue.shift();
    }

    this.sending = false;
  }

  /**
   * Sends actual HTTP message to Telegram bot API
   */
  private async sendHttpRequest(channelId: string, text: string): Promise<boolean> {
    if (!this.token || this.token.startsWith('MOCK_')) {
      // v0.8.0: never fake a delivery — a missing/MOCK token means the message
      // was NOT sent.
      console.warn('[TelegramAdapter] Cannot send message: missing or mock token.');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const response = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channelId,
          text,
          parse_mode: 'HTML',
        }),
      });
      return response.ok;
    } catch (error) {
      console.error('[TelegramAdapter] HTTP send failed:', error);
      return false;
    }
  }

  /**
   * Helper to split a long message by words/newlines
   */
  private splitText(text: string, limit: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > limit) {
      let splitAt = remaining.lastIndexOf('\n', limit);
      if (splitAt <= 0) {
        splitAt = remaining.lastIndexOf(' ', limit);
      }
      if (splitAt <= 0) {
        splitAt = limit;
      }
      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trim();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * Test-only helper to simulate receiving a message
   */
  simulateMessage(chatId: string, text: string, fromId = 11111, username = 'testuser'): void {
    if (this.messageHandler) {
      void this.messageHandler({
        message_id: Math.floor(Math.random() * 100000),
        from: { id: fromId, is_bot: false, first_name: username, username },
        chat: { id: parseInt(chatId) || 123, type: 'private', username },
        date: Math.floor(Date.now() / 1000),
        text,
      });
    }
  }

  /**
   * Probe Telegram connection health by checking polling state or bot client.
   */
  async healthCheck(): Promise<ChannelHealthStatus> {
    const start = Date.now();
    const grammyConnected = this.grammyBot !== null;
    const pollingConnected = this.isPolling && this.grammyBot === null;
    const connected = grammyConnected || pollingConnected;

    return {
      channelId: this.id,
      connected,
      latencyMs: Date.now() - start,
      message: connected
        ? `Telegram ${grammyConnected ? 'grammY bot' : 'long-poll'} active`
        : 'Telegram not connected',
      checkedAt: Date.now(),
    };
  }
}
