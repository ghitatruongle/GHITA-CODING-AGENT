// ==============================================================================
// GHITA CODING AGENT - Gateway Manager
// ==============================================================================

import type { GatewayConfig, GatewayMessage, GatewayType } from './types.js';
import { TelegramGateway } from './telegram.js';
import { DiscordGateway } from './discord.js';
import { SlackGateway } from './slack.js';

export class GatewayManager {
  private readonly gateways = new Map<GatewayType, any>();
  private messageHandler?: (message: GatewayMessage) => void | Promise<void>;

  constructor(config: GatewayConfig = {}) {
    const enabled = config.enabledGateways ?? ['telegram', 'discord', 'slack'];

    if (enabled.includes('telegram')) {
      this.gateways.set('telegram', new TelegramGateway(config.telegramToken));
    }
    if (enabled.includes('discord')) {
      this.gateways.set('discord', new DiscordGateway({
        token: config.discordToken,
        webhookUrl: config.discordWebhookUrl,
      }));
    }
    if (enabled.includes('slack')) {
      this.gateways.set('slack', new SlackGateway(config.slackToken));
    }
  }

  async initialize(): Promise<void> {
    for (const [type, gateway] of this.gateways.entries()) {
      const success = await gateway.initialize();
      if (success) {
        console.log(`[Gateway Manager] Initialized gateway: ${type} (Mock: ${gateway.isMock})`);
        gateway.onMessage((msg: GatewayMessage) => this.handleIncomingMessage(msg));
      } else {
        console.warn(`[Gateway Manager] Failed to initialize gateway: ${type}`);
      }
    }
  }

  onMessage(handler: (message: GatewayMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  async sendMessage(gatewayType: GatewayType, channelId: string, text: string): Promise<boolean> {
    const gateway = this.gateways.get(gatewayType);
    if (!gateway) {
      console.warn(`[Gateway Manager] Gateway ${gatewayType} not registered or enabled.`);
      return false;
    }
    return gateway.sendMessage(channelId, text);
  }

  getGateway<T = any>(type: GatewayType): T | undefined {
    return this.gateways.get(type) as T | undefined;
  }

  listGateways(): { type: GatewayType; isMock: boolean }[] {
    return [...this.gateways.entries()].map(([type, gw]) => ({
      type,
      isMock: gw.isMock,
    }));
  }

  async stop(): Promise<void> {
    for (const gateway of this.gateways.values()) {
      await gateway.stop();
    }
  }

  private handleIncomingMessage(message: GatewayMessage): void {
    if (this.messageHandler) {
      this.messageHandler(message);
    }
  }
}
