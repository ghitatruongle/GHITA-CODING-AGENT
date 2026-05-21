// ==============================================================================
// GHITA CODING AGENT - Telegram Communication Gateway
// ==============================================================================

import type { CommunicationGateway, GatewayMessage, GatewayType } from './types.js';

export class TelegramGateway implements CommunicationGateway {
  readonly type: GatewayType = 'telegram';
  public isMock = true;
  private messageHandler?: (message: GatewayMessage) => void | Promise<void>;
  private pollingInterval?: NodeJS.Timeout;

  constructor(private readonly token?: string) {
    if (token && token.trim() !== '' && !token.includes('MOCK_')) {
      this.isMock = false;
    }
  }

  async initialize(): Promise<boolean> {
    if (this.isMock) {
      // Setup mock polling or event simulator for testing
      return true;
    }

    try {
      // In production, we'd setup the real Telegram Bot client (e.g., node-telegram-bot-api)
      // Since dependencies might not have node-telegram-bot-api, we'll do a simple HTTP polling mock fallback 
      // or mock client that validates the token format.
      if (!this.token) return false;
      return true;
    } catch (error) {
      console.error('[Telegram Gateway] Initialization failed:', error);
      return false;
    }
  }

  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (this.isMock) {
      return true;
    }
    try {
      // In production: HTTP POST to https://api.telegram.org/bot<token>/sendMessage
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: channelId, text }),
      });
      return response.ok;
    } catch (error) {
      console.error('[Telegram Gateway] Failed to send message:', error);
      return false;
    }
  }

  onMessage(handler: (message: GatewayMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  async stop(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  /**
   * Test-only helper to simulate receiving a message
   */
  simulateMessage(text: string, channelId = '12345678', userId = 'user_tg_1', username = 'tg_user'): void {
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
}
