// ==============================================================================
// GHITA CODING AGENT - Discord Communication Gateway
// ==============================================================================

import type { CommunicationGateway, GatewayMessage, GatewayType } from './types.js';

export class DiscordGateway implements CommunicationGateway {
  readonly type: GatewayType = 'discord';
  public isMock = true;
  private messageHandler?: (message: GatewayMessage) => void | Promise<void>;

  constructor(private readonly config?: { token?: string; webhookUrl?: string }) {
    if (
      (config?.token && !config.token.includes('MOCK_')) ||
      (config?.webhookUrl && !config.webhookUrl.includes('MOCK_'))
    ) {
      this.isMock = false;
    }
  }

  async initialize(): Promise<boolean> {
    return true;
  }

  async sendMessage(_channelId: string, text: string): Promise<boolean> {
    if (this.isMock) {
      return true;
    }

    try {
      // In production, we'd hit Discord webhook or post via discord.js
      if (this.config?.webhookUrl) {
        const response = await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
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

  async stop(): Promise<void> {}

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
