// ==============================================================================
// GHITA CODING AGENT - Communication Package
// Desktop ↔ Mobile real-time communication via Socket.io
// ==============================================================================

export { CommunicationServer } from './server.js';
export { PairingManager } from './pairing.js';
export { ScreenCapture } from './screen-capture.js';
export * from './types.js';

// --- Gateway Integrations (Phase 4) ---
export * from './gateway/types.js';
export { TelegramGateway } from './gateway/telegram.js';
export { DiscordGateway } from './gateway/discord.js';
export { SlackGateway } from './gateway/slack.js';
export { GatewayManager } from './gateway/manager.js';

// --- Telepresence Portal Integration (Phase 18) ---
export { TelepresencePortal } from './channels/telepresencePortal.js';

export const COMMUNICATION_VERSION = '0.1.0';
