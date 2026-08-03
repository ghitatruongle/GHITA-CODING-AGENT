// ==============================================================================
// GHITA CODING AGENT - Discord Communication Gateway
// ==============================================================================

import WebSocket, { type RawData } from 'ws';
import type { CommunicationGateway, GatewayMessage, GatewayType } from './types.js';

export class DiscordGateway implements CommunicationGateway {
  readonly type: GatewayType = 'discord';
  public isMock = true;
  private messageHandler?: (message: GatewayMessage) => void | Promise<void>;
  private socket?: WebSocket;
  private heartbeat?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private gatewayUrl?: string;
  private sequence: number | null = null;
  private reconnectAttempts = 0;
  private stopped = true;
  private readonly recentMessageIds = new Set<string>();

  constructor(private readonly config?: { token?: string; webhookUrl?: string }) {
    if (
      (config?.token && !config.token.includes('MOCK_')) ||
      (config?.webhookUrl && !config.webhookUrl.includes('MOCK_'))
    ) {
      this.isMock = false;
    }
  }

  async initialize(): Promise<boolean> {
    if (this.isMock) {
      // v0.8.0: a mock gateway cannot actually initialize; report truthfully.
      console.warn('[Discord Gateway] Mock mode — no real token/webhook. Not initialized.');
      return false;
    }
    if (!this.config?.token) return Boolean(this.config?.webhookUrl);

    try {
      const response = await fetch('https://discord.com/api/v10/gateway/bot', {
        headers: { Authorization: `Bot ${this.config.token}` },
      });
      const payload = (await response.json()) as { url?: string };
      if (!response.ok || !payload.url) return false;
      this.gatewayUrl = `${payload.url}?v=10&encoding=json`;
      this.stopped = false;
      return this.connect();
    } catch (error) {
      console.error('[Discord Gateway] Initialization failed:', error);
      return false;
    }
  }

  async sendMessage(_channelId: string, text: string): Promise<boolean> {
    if (this.isMock) {
      // v0.8.0: never fake delivery — a MOCK token means nothing was sent.
      console.warn('[Discord Gateway] Cannot send in mock mode (no real token/webhook).');
      return false;
    }

    try {
      if (this.config?.webhookUrl) {
        const response = await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
        return response.ok;
      }
      if (this.config?.token) {
        const response = await fetch(
          `https://discord.com/api/v10/channels/${encodeURIComponent(_channelId)}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bot ${this.config.token}`,
            },
            body: JSON.stringify({ content: text }),
          },
        );
        return response.ok;
      }
      return false;
    } catch (error) {
      console.error('[Discord Gateway] Failed to send message:', error);
      return false;
    }
  }

  onMessage(handler: (message: GatewayMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.reconnectTimer = undefined;
    this.heartbeat = undefined;

    const socket = this.socket;
    this.socket = undefined;
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolvePromise) => {
      socket.once('close', () => resolvePromise());
      socket.close(1000, 'GHITA gateway stopped');
      setTimeout(resolvePromise, 1000);
    });
  }

  /**
   * Test-only helper to simulate receiving a message
   */
  simulateMessage(
    text: string,
    channelId = 'discord_chan_1',
    userId = 'user_dc_1',
    username = 'discord_user',
  ): void {
    if (this.messageHandler) {
      const msg: GatewayMessage = {
        id: `dc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        gatewayType: 'discord',
        channelId,
        userId,
        username,
        text,
        timestamp: Date.now(),
      };
      this.messageHandler(msg);
    }
  }

  private connect(): Promise<boolean> {
    const gatewayUrl = this.gatewayUrl;
    if (!gatewayUrl || this.stopped) return Promise.resolve(false);
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return Promise.resolve(true);
    }

    return new Promise((resolveConnection) => {
      const socket = new WebSocket(gatewayUrl);
      this.socket = socket;
      let resolved = false;

      socket.once('open', () => {
        resolved = true;
        resolveConnection(true);
      });
      socket.on('message', (raw) => this.handleGatewayPayload(raw));
      socket.once('error', (error) => {
        console.error('[Discord Gateway] WebSocket error:', error);
        if (!resolved) {
          resolved = true;
          resolveConnection(false);
        }
      });
      socket.once('close', () => {
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = undefined;
        if (!resolved) {
          resolved = true;
          resolveConnection(false);
        }
        this.scheduleReconnect();
      });
    });
  }

  private handleGatewayPayload(raw: RawData): void {
    let payload: {
      op: number;
      t?: string;
      s?: number;
      d?: unknown;
    };
    try {
      payload = JSON.parse(raw.toString()) as typeof payload;
    } catch {
      return;
    }

    if (typeof payload.s === 'number') this.sequence = payload.s;
    if (payload.op === 10) {
      const hello = payload.d as { heartbeat_interval?: number };
      const interval = hello.heartbeat_interval ?? 45_000;
      this.sendGatewayPayload({ op: 1, d: this.sequence });
      this.heartbeat = setInterval(
        () => this.sendGatewayPayload({ op: 1, d: this.sequence }),
        interval,
      );
      this.identify();
      return;
    }
    if (payload.op === 7) {
      this.socket?.close(1012, 'Discord requested reconnect');
      return;
    }
    if (payload.op !== 0) return;

    if (payload.t === 'READY') {
      this.reconnectAttempts = 0;
      return;
    }
    if (payload.t !== 'MESSAGE_CREATE') return;

    const message = payload.d as {
      id?: string;
      channel_id?: string;
      content?: string;
      timestamp?: string;
      author?: { id?: string; username?: string; bot?: boolean };
    };
    if (
      message.author?.bot ||
      !message.id ||
      !message.channel_id ||
      !message.author?.id ||
      !message.content ||
      !this.messageHandler
    ) {
      return;
    }
    if (!this.rememberMessage(message.id)) return;

    void this.messageHandler({
      id: message.id,
      gatewayType: 'discord',
      channelId: message.channel_id,
      userId: message.author.id,
      username: message.author.username ?? 'discord_user',
      text: message.content,
      timestamp: message.timestamp ? Date.parse(message.timestamp) : Date.now(),
    });
  }

  private rememberMessage(messageId: string): boolean {
    if (this.recentMessageIds.has(messageId)) return false;
    this.recentMessageIds.add(messageId);
    if (this.recentMessageIds.size > 2048) {
      const oldestMessageId = this.recentMessageIds.values().next().value;
      if (oldestMessageId) this.recentMessageIds.delete(oldestMessageId);
    }
    return true;
  }

  private identify(): void {
    if (!this.config?.token) return;
    this.sendGatewayPayload({
      op: 2,
      d: {
        token: this.config.token,
        intents: 33_281,
        properties: {
          os: process.platform,
          browser: 'ghita-coding-agent',
          device: 'ghita-coding-agent',
        },
      },
    });
  }

  private sendGatewayPayload(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || !this.gatewayUrl || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }
}

/**
 * Daemon-friendly wrapper: start Discord bot, returns stop function.
 */
export async function startDiscordBot(
  token: string,
  onMessage: (msg: unknown) => void | Promise<void>,
): Promise<{ stop: () => Promise<void> }> {
  const gateway = new DiscordGateway({ token });
  await gateway.initialize();
  gateway.onMessage(onMessage as (m: GatewayMessage) => void | Promise<void>);
  return {
    stop: async () => {
      await gateway.stop();
    },
  };
}
