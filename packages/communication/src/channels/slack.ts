import type { ChannelAdapter, ChannelHealthStatus } from '../channel-plugin-contract.js';
import { safeFetch } from '../utils/security.js';

interface WSClient {
  close(): void;
  on(event: string, cb: (data?: unknown) => void): void;
  send(data: string): void;
  readyState?: number;
}

export class SlackAdapter implements ChannelAdapter {
  readonly id = 'slack';
  private appToken: string;
  private botToken: string;
  private messageHandler?: (message: unknown) => void | Promise<void>;
  private isRunning = false;
  private ws: WSClient | null = null;

  constructor(appToken: string, botToken: string) {
    this.appToken = appToken;
    this.botToken = botToken;
  }

  onMessage(handler: (message: unknown) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Send outbound message to a Slack channel via chat.postMessage API.
   */
  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (!this.botToken || this.botToken.startsWith('MOCK_')) {
      // v0.8.0: never fake a successful delivery — a missing/MOCK token means
      // the message was NOT sent.
      console.warn('[SlackAdapter] Cannot send message: missing or mock bot token.');
      return false;
    }

    try {
      const response = await safeFetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          text,
        }),
      });

      if (!response.ok) return false;
      const data = (await response.json()) as { ok?: boolean };
      return Boolean(data && data.ok);
    } catch (error) {
      console.error('[SlackAdapter] Send message failed:', error);
      return false;
    }
  }

  /**
   * Start Slack Socket Mode client
   */
  async start(): Promise<void> {
    this.isRunning = true;
    if (!this.appToken || this.appToken.startsWith('MOCK_')) {
      // Missing/mock token: report that the channel is not actually connected.
      console.warn('[SlackAdapter] Cannot connect: missing or mock app token.');
      return;
    }
    await this.startSocketMode();
  }

  /**
   * Stop Slack Socket Mode connection
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  /**
   * Handshake and open standard Slack Socket Mode WebSocket connection
   */
  private async startSocketMode(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const response = await safeFetch('https://slack.com/api/apps.connections.open', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.appToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('[SlackAdapter] Failed apps.connections.open call');
        setTimeout(() => this.startSocketMode(), 10000);
        return;
      }

      const data = (await response.json()) as { ok?: boolean; url?: string };
      if (data && data.ok && data.url) {
        await this.connectWS(data.url);
      } else {
        console.error('[SlackAdapter] apps.connections.open error details:', data);
        setTimeout(() => this.startSocketMode(), 10000);
      }
    } catch (error) {
      console.error('[SlackAdapter] Apps connection open failed:', error);
      setTimeout(() => this.startSocketMode(), 10000);
    }
  }

  /**
   * Establish WebSocket connection
   */
  private async connectWS(url: string): Promise<void> {
    if (!this.isRunning) return;

    try {
      let WebSocketCtor: new (url: string) => WSClient = (
        globalThis as unknown as { WebSocket?: new (url: string) => WSClient }
      ).WebSocket as new (url: string) => WSClient;
      if (!WebSocketCtor) {
        try {
          const wsModule = await import('ws');
          WebSocketCtor = wsModule.default as new (url: string) => WSClient;
        } catch {
          console.warn(
            '[SlackAdapter] WebSocket not available in host environment. Socket Mode skipped.',
          );
          return;
        }
      }

      const socket = new WebSocketCtor(url);
      this.ws = socket;

      socket.on('open', () => {
        console.info('[SlackAdapter] Socket Mode WebSocket open');
      });

      socket.on('message', async (rawData: unknown) => {
        try {
          const data = JSON.parse(String(rawData));
          const { envelope_id, payload, type } = data;

          // Acknowledge envelope to avoid event retries
          if (envelope_id && socket.readyState === 1 /* OPEN */) {
            socket.send(JSON.stringify({ envelope_id }));
          }

          if (type === 'events_api' && payload && payload.event) {
            const event = payload.event;
            // Ignore bot messages to prevent loopbacks
            if (event.bot_id || event.subtype === 'bot_message') return;

            if (event.type === 'message' && this.messageHandler) {
              await this.messageHandler({
                id: event.client_msg_id || `slack_${Date.now()}`,
                channel: event.channel,
                text: event.text,
                user: event.user,
                timestamp: event.ts,
              });
            }
          }
        } catch (err) {
          console.error('[SlackAdapter] WS message processing error:', err);
        }
      });

      socket.on('close', () => {
        if (this.isRunning) {
          setTimeout(() => this.startSocketMode(), 5000); // Reconnect
        }
      });

      socket.on('error', (err: unknown) => {
        console.error('[SlackAdapter] WS error:', err);
      });
    } catch (error) {
      console.error('[SlackAdapter] WS connection setup failed:', error);
    }
  }

  /**
   * Test-only helper to simulate receiving a message
   */
  simulateMessage(channel: string, text: string, user = 'U12345'): void {
    if (this.messageHandler) {
      void this.messageHandler({
        id: `slack_${Date.now()}`,
        channel,
        text,
        user,
        timestamp: (Date.now() / 1000).toString(),
      });
    }
  }

  /**
   * Probe Slack connection health by checking Socket Mode WS state.
   */
  async healthCheck(): Promise<ChannelHealthStatus> {
    const start = Date.now();
    const wsOpen = this.ws?.readyState === 1;

    return {
      channelId: this.id,
      connected: wsOpen,
      latencyMs: Date.now() - start,
      message: wsOpen ? 'Slack Socket Mode connected' : 'Slack not connected',
      checkedAt: Date.now(),
    };
  }
}
