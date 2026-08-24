export type GatewayType = 'telegram' | 'discord' | 'slack';

export interface GatewayMessage {
  id: string;
  gatewayType: GatewayType;
  channelId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

export interface GatewayConfig {
  telegramToken?: string;
  discordWebhookUrl?: string;
  discordToken?: string;
  slackToken?: string;
  slackAppToken?: string;
  slackSigningSecret?: string;
  enabledGateways?: GatewayType[];
}

export interface CommunicationGateway {
  readonly type: GatewayType;
  readonly isMock: boolean;
  initialize(): Promise<boolean>;
  sendMessage(channelId: string, text: string): Promise<boolean>;
  onMessage(handler: (message: GatewayMessage) => void | Promise<void>): void;
  stop(): Promise<void>;
}
