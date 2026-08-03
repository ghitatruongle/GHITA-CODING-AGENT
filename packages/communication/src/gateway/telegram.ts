// ==============================================================================
// GHITA CODING AGENT - Telegram Communication Gateway
// ==============================================================================

import type { CommunicationGateway, GatewayMessage, GatewayType } from './types.js';

export class TelegramGateway implements CommunicationGateway {
  readonly type: GatewayType = 'telegram';
  public isMock = true;
  private messageHandler?: (message: GatewayMessage) => void | Promise<void>;
  private pollingAbort?: AbortController;
  private pollingPromise?: Promise<void>;
  private nextUpdateOffset = 0;

  constructor(private readonly token?: string) {
    if (token && token.trim() !== '' && !token.includes('MOCK_')) {
      this.isMock = false;
    }
  }

  async initialize(): Promise<boolean> {
    if (this.isMock) {
      // v0.8.0: mock mode no longer pretends to be initialized. A mock gateway
      // cannot send real messages; callers must treat it as unconfigured.
      console.warn(
        '[Telegram Gateway] Running in mock mode — no real token. Messages will NOT be delivered.',
      );
      return false;
    }

    try {
      if (!this.token) return false;
      const response = await fetch(`https://api.telegram.org/bot${this.token}/getMe`);
      const result = (await response.json()) as { ok?: boolean };
      return response.ok && result.ok === true;
    } catch (error) {
      console.error('[Telegram Gateway] Initialization failed:', error);
      return false;
    }
  }

  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (this.isMock) {
      // v0.8.0: never report a fake success for an undelivered message.
      console.error('[Telegram Gateway] Cannot send message in mock mode (no real token).');
      return false;
    }
    try {
      if (!this.token) return false;
      // HTTP POST to https://api.telegram.org/bot<token>/sendMessage
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: channelId, text }),
      });
      const result = (await response.json()) as { ok?: boolean };
      return response.ok && result.ok === true;
    } catch (error) {
      console.error('[Telegram Gateway] Failed to send message:', error);
      return false;
    }
  }

  onMessage(handler: (message: GatewayMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
    if (!this.isMock && !this.pollingPromise) {
      this.pollingAbort = new AbortController();
      this.pollingPromise = this.pollUpdates(this.pollingAbort.signal);
    }
  }

  async stop(): Promise<void> {
    this.pollingAbort?.abort();
    await this.pollingPromise;
    this.pollingAbort = undefined;
    this.pollingPromise = undefined;
  }

  /**
   * Test-only helper to simulate receiving a message
   */
  simulateMessage(
    text: string,
    channelId = '12345678',
    userId = 'user_tg_1',
    username = 'tg_user',
  ): void {
    if (this.messageHandler) {
      const msg: GatewayMessage = {
        id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        gatewayType: 'telegram',
        channelId,
        userId,
        username,
        text,
        timestamp: Date.now(),
      };
      this.messageHandler(msg);
    }
  }

  private async pollUpdates(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && this.token) {
      try {
        const query = new URLSearchParams({
          timeout: '20',
          offset: String(this.nextUpdateOffset),
          allowed_updates: JSON.stringify(['message']),
        });
        const response = await fetch(
          `https://api.telegram.org/bot${this.token}/getUpdates?${query.toString()}`,
          { signal },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          result?: Array<{
            update_id: number;
            message?: {
              message_id: number;
              date: number;
              text?: string;
              chat: { id: number | string };
              from?: { id: number | string; username?: string; first_name?: string };
            };
          }>;
        };

        if (!response.ok || payload.ok !== true) {
          throw new Error(`Telegram polling failed with status ${response.status}`);
        }

        for (const update of payload.result ?? []) {
          if (update.update_id < this.nextUpdateOffset) continue;
          this.nextUpdateOffset = Math.max(this.nextUpdateOffset, update.update_id + 1);
          const message = update.message;
          if (!message?.text || !this.messageHandler) continue;
          await this.messageHandler({
            id: `tg_${message.message_id}`,
            gatewayType: 'telegram',
            channelId: String(message.chat.id),
            userId: String(message.from?.id ?? message.chat.id),
            username: message.from?.username ?? message.from?.first_name ?? 'telegram_user',
            text: message.text,
            timestamp: message.date * 1000,
          });
        }
      } catch (error) {
        if (signal.aborted) return;
        console.error('[Telegram Gateway] Polling failed:', error);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
      }
    }
  }
}

/**
 * Daemon-friendly wrapper: start Telegram bot, returns stop function.
 */
export async function startTelegramBot(
  token: string,
  onMessage: (msg: unknown) => void | Promise<void>,
): Promise<{ stop: () => Promise<void> }> {
  const gateway = new TelegramGateway(token);
  await gateway.initialize();
  gateway.onMessage(onMessage as (m: GatewayMessage) => void | Promise<void>);
  return {
    stop: async () => {
      await gateway.stop();
    },
  };
}
