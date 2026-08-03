import type { ChannelAdapter, ChannelHealthStatus } from '../channel-plugin-contract.js';
import { safeFetch } from '../utils/security.js';

interface WSClient {
  close(): void;
  on(event: string, cb: (data?: unknown) => void): void;
  send(data: string): void;
  readyState?: number;
}

interface DiscordClient {
  on(event: string, cb: (data?: unknown) => void): void;
  login(token: string): Promise<void>;
  destroy(): Promise<void>;
}

export class DiscordAdapter implements ChannelAdapter {
  readonly id = 'discord';
  private token: string;
  private messageHandler?: (message: unknown) => void | Promise<void>;
  private isRunning = false;
  private ws: WSClient | null = null;
  private discordClient: DiscordClient | null = null;

  constructor(token: string) {
    this.token = token;
  }

  onMessage(handler: (message: unknown) => void | Promise<void>): void {
    this.messageHandler = handler;
    if (this.discordClient) {
      this.discordClient.on('messageCreate', async (message: unknown) => {
        const msg = message as { author?: { bot?: boolean } };
        if (msg.author?.bot) return;
        if (this.messageHandler) {
          await this.messageHandler(message);
        }
      });
    }
  }

  /**
   * Send outbound message to Discord channel.
   */
  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (!this.token || this.token.startsWith('MOCK_')) {
      // v0.8.0: never fake a successful delivery — a missing/MOCK token means
      // the message was NOT sent.
      console.warn('[DiscordAdapter] Cannot send message: missing or mock token.');
      return false;
    }

    try {
      const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
      const response = await safeFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: text }),
      });
      return response.ok;
    } catch (error) {
      console.error('[DiscordAdapter] Send failed:', error);
      return false;
    }
  }

  /**
   * Start gateway listener (tries discord.js, then falls back to native WebSocket)
   */
  async start(): Promise<void> {
    this.isRunning = true;
    try {
      const moduleName = 'discord.js';
      const { Client, GatewayIntentBits } = await import(moduleName);
      this.discordClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      });
      if (this.discordClient && this.messageHandler) {
        const handler = this.messageHandler;
        this.discordClient.on('messageCreate', async (message: unknown) => {
          const msg = message as { author?: { bot?: boolean } };
          if (msg.author?.bot) return;
          await handler(message);
        });
      }
      if (this.discordClient) {
        await this.discordClient.login(this.token);
      }
      console.info('[DiscordAdapter] Started via discord.js client');
    } catch {
      // Fallback: Native Gateway WS connection
      console.info('[DiscordAdapter] discord.js not available. Falling back to native Gateway WS.');
      await this.connectGatewayWS();
    }
  }

  /**
   * Stop gateway worker
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.discordClient) {
      try {
        await this.discordClient.destroy();
      } catch {
        // Ignore
      }
      this.discordClient = null;
    }
    if (this.ws) {
      try {
        if (typeof this.ws.close === 'function') {
          this.ws.close();
        }
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  /**
   * Establish connection to Discord Gateway WebSocket directly
   */
  private async connectGatewayWS(): Promise<void> {
    if (!this.isRunning) return;
    if (!this.token || this.token.startsWith('MOCK_')) {
      // Missing/mock token: report that the channel is not actually connected.
      console.warn('[DiscordAdapter] Cannot connect gateway: missing or mock token.');
      return;
    }

    try {
      let WebSocketCtor: new (url: string) => WSClient = (
        globalThis as unknown as { WebSocket?: new (url: string) => WSClient }
      ).WebSocket as new (url: string) => WSClient;
      if (!WebSocketCtor) {
        try {
          const wsModule = await import('ws');
          WebSocketCtor = wsModule.default as new (url: string) => WSClient;
        } catch {
          // If neither is available, fail gracefully
          console.warn(
            '[DiscordAdapter] WebSocket not available in host environment. Gateway skipped.',
          );
          return;
        }
      }

      const gatewayUrl = 'wss://gateway.discord.gg/?v=10&encoding=json';
      const socket = new WebSocketCtor(gatewayUrl);
      this.ws = socket;

      let heartbeatInterval = 40000;
      let heartbeatTimer: NodeJS.Timeout | null = null;

      socket.on('open', () => {
        // Connected
      });

      socket.on('message', async (rawData: unknown) => {
        try {
          const data = JSON.parse(String(rawData));
          const { op, t, d } = data;

          if (op === 10) {
            // Hello
            heartbeatInterval = d.heartbeat_interval;
            heartbeatTimer = setInterval(() => {
              socket.send(JSON.stringify({ op: 1, d: null }));
            }, heartbeatInterval);
            if (heartbeatTimer && typeof heartbeatTimer === 'object' && 'unref' in heartbeatTimer) {
              heartbeatTimer.unref();
            }

            // Identify payload
            socket.send(
              JSON.stringify({
                op: 2,
                d: {
                  token: this.token,
                  intents: 33280, // Guilds + Guild Messages + Message Content
                  properties: {
                    os: process.platform,
                    browser: 'ghita-agent',
                    device: 'ghita-agent',
                  },
                },
              }),
            );
          }

          if (t === 'MESSAGE_CREATE') {
            if (d.author?.bot) return;
            if (this.messageHandler) {
              await this.messageHandler({
                id: d.id,
                channelId: d.channel_id,
                content: d.content,
                author: {
                  id: d.author.id,
                  username: d.author.username,
                  bot: d.author.bot,
                },
              });
            }
          }
        } catch (err) {
          console.error('[DiscordAdapter] WS message decode error:', err);
        }
      });

      socket.on('close', () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (this.isRunning) {
          setTimeout(() => this.connectGatewayWS(), 5000); // Reconnect
        }
      });

      socket.on('error', (err: unknown) => {
        console.error('[DiscordAdapter] WS error:', err);
      });
    } catch (error) {
      console.error('[DiscordAdapter] Direct Gateway WS connection error:', error);
    }
  }

  /**
   * Test-only helper to simulate receiving a message
   */
  simulateMessage(
    channelId: string,
    content: string,
    userId = 'user_abc',
    username = 'discorduser',
  ): void {
    if (this.messageHandler) {
      void this.messageHandler({
        id: `msg_${Date.now()}`,
        channelId,
        content,
        author: {
          id: userId,
          username,
          bot: false,
        },
      });
    }
  }

  /**
   * Probe Discord connection health by checking client or WS state.
   */
  async healthCheck(): Promise<ChannelHealthStatus> {
    const start = Date.now();
    const wsOpen = this.ws?.readyState === 1;
    const clientConnected = this.discordClient !== null;
    const connected = wsOpen || clientConnected;

    return {
      channelId: this.id,
      connected,
      latencyMs: Date.now() - start,
      message: connected
        ? `Discord ${clientConnected ? 'client' : 'gateway WS'} connected`
        : 'Discord not connected',
      checkedAt: Date.now(),
    };
  }
}
