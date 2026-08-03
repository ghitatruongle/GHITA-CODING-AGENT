// ==============================================================================
// GHITA CODING AGENT - Slack Communication Gateway
// ==============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import type { CommunicationGateway, GatewayMessage, GatewayType } from './types.js';

export interface SlackGatewayConfig {
  botToken?: string;
  appToken?: string;
  signingSecret?: string;
}

export class SlackGateway implements CommunicationGateway {
  readonly type: GatewayType = 'slack';
  public isMock = true;
  private messageHandler?: (message: GatewayMessage) => void | Promise<void>;
  private readonly config: SlackGatewayConfig;
  private socket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private stopped = true;
  private readonly recentMessageIds = new Set<string>();

  constructor(config?: string | SlackGatewayConfig) {
    this.config = typeof config === 'string' ? { botToken: config } : (config ?? {});
    const configuredTokens = [this.config.botToken, this.config.appToken].filter(Boolean);
    if (configuredTokens.some((token) => !token?.includes('MOCK_'))) {
      this.isMock = false;
    }
  }

  async initialize(): Promise<boolean> {
    if (this.isMock) {
      // v0.8.0: a mock gateway cannot actually initialize; report truthfully.
      console.warn('[Slack Gateway] Mock mode — no real token. Not initialized.');
      return false;
    }
    if (!this.config.botToken) return false;

    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.botToken}` },
      });
      const payload = (await response.json()) as { ok?: boolean };
      if (!response.ok || payload.ok !== true) return false;

      this.stopped = false;
      if (this.config.appToken) return this.connectSocketMode();
      return true;
    } catch (error) {
      console.error('[Slack Gateway] Initialization failed:', error);
      return false;
    }
  }

  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (this.isMock) {
      // v0.8.0: never fake delivery — a MOCK token means nothing was sent.
      console.warn('[Slack Gateway] Cannot send in mock mode (no real token).');
      return false;
    }

    try {
      // In production: Post to Slack web API chat.postMessage
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.botToken}`,
        },
        body: JSON.stringify({ channel: channelId, text }),
      });
      const data = (await response.json()) as { ok: boolean };
      return response.ok && data.ok;
    } catch (error) {
      console.error('[Slack Gateway] Failed to send message:', error);
      return false;
    }
  }

  onMessage(handler: (message: GatewayMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
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
    channelId = 'C12345',
    userId = 'U12345',
    username = 'slack_user',
  ): void {
    if (this.messageHandler) {
      const msg: GatewayMessage = {
        id: `sl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        gatewayType: 'slack',
        channelId,
        userId,
        username,
        text,
        timestamp: Date.now(),
      };
      this.messageHandler(msg);
    }
  }

  /**
   * Accept a Slack Events API request after verifying its v0 HMAC signature.
   * The HTTP host should pass the exact, unparsed request body.
   */
  async ingestSignedEvent(
    rawBody: string,
    signature: string | undefined,
    timestamp: string | undefined,
  ): Promise<{ accepted: boolean; challenge?: string }> {
    if (!this.verifySignature(rawBody, signature, timestamp)) return { accepted: false };

    const payload = JSON.parse(rawBody) as {
      type?: string;
      challenge?: string;
      event?: SlackMessageEvent;
    };
    if (payload.type === 'url_verification' && payload.challenge) {
      return { accepted: true, challenge: payload.challenge };
    }
    if (payload.type === 'event_callback' && payload.event) {
      await this.dispatchEvent(payload.event);
      return { accepted: true };
    }
    return { accepted: false };
  }

  private async connectSocketMode(): Promise<boolean> {
    if (!this.config.appToken || this.stopped) return false;
    try {
      const response = await fetch('https://slack.com/api/apps.connections.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.appToken}` },
      });
      const payload = (await response.json()) as { ok?: boolean; url?: string };
      if (!response.ok || payload.ok !== true || !payload.url) return false;
      return await this.openSocket(payload.url);
    } catch (error) {
      console.error('[Slack Gateway] Socket Mode connection failed:', error);
      return false;
    }
  }

  private openSocket(url: string): Promise<boolean> {
    return new Promise((resolveConnection) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      let resolved = false;
      socket.once('open', () => {
        resolved = true;
        this.reconnectAttempts = 0;
        resolveConnection(true);
      });
      socket.on('message', (raw) => void this.handleSocketMessage(raw));
      socket.once('error', (error) => {
        console.error('[Slack Gateway] WebSocket error:', error);
        if (!resolved) {
          resolved = true;
          resolveConnection(false);
        }
      });
      socket.once('close', () => {
        if (!resolved) {
          resolved = true;
          resolveConnection(false);
        }
        this.scheduleReconnect();
      });
    });
  }

  private async handleSocketMessage(raw: RawData): Promise<void> {
    let envelope: {
      envelope_id?: string;
      type?: string;
      payload?: { event?: SlackMessageEvent };
    };
    try {
      envelope = JSON.parse(raw.toString()) as typeof envelope;
    } catch {
      return;
    }

    // P1-5 (deep review pass #2): only ack the envelope AFTER we have
    // successfully consumed the event. The previous code acked every envelope
    // unconditionally, which trains Slack to retry indefinitely when the
    // handler is dropped or the event is malformed — multiplying load on
    // our sidecar.
    if (envelope.type === 'events_api' && envelope.payload?.event) {
      const consumed = await this.dispatchEvent(envelope.payload.event);
      if (consumed && envelope.envelope_id && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
      }
      return;
    }
    // Non-events_api envelopes (e.g. `disconnect`, `ping`) are ack-only —
    // ack them so Slack doesn't retry.
    if (envelope.envelope_id && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
    }
  }

  private async dispatchEvent(event: SlackMessageEvent): Promise<boolean> {
    if (
      event.type !== 'message' ||
      event.subtype ||
      event.bot_id ||
      !event.channel ||
      !event.user ||
      !event.text ||
      !this.messageHandler
    ) {
      return false;
    }
    const messageId = event.client_msg_id ?? `sl_${event.ts ?? Date.now()}`;
    if (!this.rememberMessage(messageId)) return false;

    await this.messageHandler({
      id: messageId,
      gatewayType: 'slack',
      channelId: event.channel,
      userId: event.user,
      username: event.username ?? event.user,
      text: event.text,
      timestamp: event.ts ? Math.floor(Number(event.ts) * 1000) : Date.now(),
    });
    return true;
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

  private verifySignature(
    rawBody: string,
    signature: string | undefined,
    timestamp: string | undefined,
  ): boolean {
    if (!this.config.signingSecret || !signature || !timestamp) return false;
    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > 60 * 5
    ) {
      return false;
    }
    const expected = `v0=${createHmac('sha256', this.config.signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    return (
      expectedBuffer.length === signatureBuffer.length &&
      timingSafeEqual(expectedBuffer, signatureBuffer)
    );
  }

  private scheduleReconnect(): void {
    if (this.stopped || !this.config.appToken || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectSocketMode();
    }, delay);
  }
}

interface SlackMessageEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  channel?: string;
  user?: string;
  username?: string;
  text?: string;
  ts?: string;
  client_msg_id?: string;
}

/**
 * Daemon-friendly wrapper: start Slack bot, returns stop function.
 * Used by GatewayDaemon.registerWorker().
 */
export async function startSlackBot(
  token: string,
  onMessage: (msg: unknown) => void | Promise<void>,
): Promise<{ stop: () => Promise<void> }> {
  const gateway = new SlackGateway(token);
  await gateway.initialize();
  gateway.onMessage(onMessage as (m: GatewayMessage) => void | Promise<void>);
  return {
    stop: async () => {
      await gateway.stop();
    },
  };
}
