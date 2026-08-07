// ==============================================================================
// GHITA CODING AGENT - Communication Package
// Desktop ↔ Mobile real-time communication via Socket.io
// ==============================================================================

export { CommunicationServer } from './server.js';
export { PairingManager } from './pairing.js';
export { ScreenCapture } from './screen-capture.js';
export * from './types.js';

// --- Gateway Daemon (Phase 8) ---
export { GatewayDaemon, getDefaultDaemon, resetDefaultDaemon, runDaemonCli } from './daemon.js';
export type {
  DaemonConfig,
  DaemonState,
  DaemonHealth,
  WorkerStatus,
  DaemonEventMap,
} from './daemon.js';

// --- Guardrail Pipeline (Phase 8) ---
export { GuardrailPipeline, createDaemonGuardrailHook } from './guardrail-pipeline.js';
export type {
  GuardrailPipelineConfig,
  GuardrailPipelineResult,
  GuardrailThreat,
} from './guardrail-pipeline.js';

// --- Gateway Integrations (Phase 4) ---
export * from './gateway/types.js';
export { TelegramGateway, startTelegramBot } from './gateway/telegram.js';
export { DiscordGateway, startDiscordBot } from './gateway/discord.js';
export { SlackGateway, startSlackBot } from './gateway/slack.js';
export type { SlackGatewayConfig } from './gateway/slack.js';
export { GatewayManager } from './gateway/manager.js';
export {
  MultiChannelGateway,
  type ChatChannelPlatform,
  type InboundChatMessage,
  type OutboundChatMessage,
} from './gateway/multi-channel-gateway.js';

// --- Channel Plugin Contract & FIFO Lanes (Phase 8) ---
export * from './channel-plugin-contract.js';

// --- Telepresence Portal Integration (Phase 18) ---
export { TelepresencePortal } from './channels/telepresencePortal.js';

// --- Channel Adapters & Security Utilities (Phase 9 & 10) ---
export { TelegramAdapter } from './channels/telegram.js';
export { DiscordAdapter } from './channels/discord.js';
export { WhatsAppAdapter } from './channels/whatsapp.js';
export { IMessageAdapter } from './channels/imessage.js';
export { SlackAdapter } from './channels/slack.js';
export { isSafeUrl, safeFetch, getSessionKey } from './utils/security.js';

// --- Phase 29: WebSocket Multiplexer ---
export { WsChannel, ReconnectStrategy, WsMultiplexer } from './ws/index.js';
export type {
  WsConnectionState,
  WsFrameType,
  ChannelMessage,
  ChannelSubscriptionOptions,
  ReconnectConfig,
  WsMultiplexerConfig,
  WsConnectionEvent,
  WsConnectionListener,
  ChannelHandler,
  BinaryFrameHeader,
  WsMuxStats,
} from './ws/index.js';

export const COMMUNICATION_VERSION = '1.0.0';
