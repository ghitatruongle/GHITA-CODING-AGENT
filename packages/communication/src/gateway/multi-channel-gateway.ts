// ==============================================================================
// GHITA CODING AGENT - Hermes Agent Multi-Channel Chat Gateway
// ==============================================================================
// Bridges GHITA Agent to external messaging channels (Telegram, Slack, Discord).
// ==============================================================================

export type ChatChannelPlatform = 'telegram' | 'slack' | 'discord' | 'matrix' | 'whatsapp';

export interface InboundChatMessage {
  platform: ChatChannelPlatform;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export interface OutboundChatMessage {
  platform: ChatChannelPlatform;
  chatId: string;
  text: string;
  replyToId?: string;
}

export class MultiChannelGateway {
  private handlers: Map<ChatChannelPlatform, (msg: InboundChatMessage) => Promise<string>> =
    new Map();

  registerPlatformHandler(
    platform: ChatChannelPlatform,
    handler: (msg: InboundChatMessage) => Promise<string>,
  ): void {
    this.handlers.set(platform, handler);
  }

  async processInboundMessage(msg: InboundChatMessage): Promise<OutboundChatMessage> {
    const handler = this.handlers.get(msg.platform);
    let replyText = `[GHITA Agent Gateway]: Received request via ${msg.platform}.`;

    if (handler) {
      try {
        replyText = await handler(msg);
      } catch (err) {
        replyText = `[Error processing message on ${msg.platform}]: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    return {
      platform: msg.platform,
      chatId: msg.chatId,
      text: replyText,
    };
  }
}
