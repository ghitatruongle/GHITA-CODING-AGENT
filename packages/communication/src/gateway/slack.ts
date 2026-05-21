// ==============================================================================
// GHITA CODING AGENT - Slack Communication Gateway
// ==============================================================================

import type { CommunicationGateway, GatewayMessage, GatewayType } from './types.js';

export class SlackGateway implements CommunicationGateway {
  readonly type: GatewayType = 'slack';
  public isMock = true;
  private messageHandler?: (message: GatewayMessage) => void | Promise<void>;

  constructor(private readonly token?: string) {
    if (token && token.trim() !== '' && !token.includes('MOCK_')) {
      this.isMock = false;
    }
  }

  async initialize(): Promise<boolean> {
    return true;
  }

  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (this.isMock) {
      return true;
    }

    try {
      // In production: Post to Slack web API chat.postMessage
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ channel: channelId, text }),
      });
      const data = await response.json() as { ok: boolean };
      return response.ok && data.ok;
    } catch (error) {
      console.error('[Slack Gateway] Failed to send message:', error);
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
  simulateMessage(text: string, channelId = 'C12345', userId = 'U12345', username = 'slack_user'): void {
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
}
