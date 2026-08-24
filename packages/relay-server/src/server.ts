// @ghita/relay-server -- Relay Server

import type { RelayConfig, RelayMessage } from './types.js';
import { RoomManager } from './room-manager.js';
import { ConnectionBroker } from './connection-broker.js';
import { RateLimiter } from './rate-limiter.js';

export class RelayServer {
  readonly rooms: RoomManager;
  readonly connections: ConnectionBroker;
  readonly rateLimiter: RateLimiter;
  private readonly config: RelayConfig;

  constructor(config: RelayConfig) {
    this.config = config;
    this.rooms = new RoomManager(config.maxRooms);
    this.connections = new ConnectionBroker();
    this.rateLimiter = new RateLimiter(100, 60_000);
  }

  getConfig(): RelayConfig {
    return { ...this.config };
  }

  handleMessage(message: RelayMessage): RelayMessage | null {
    if (!this.rateLimiter.check(message.from)) return null;
    return message;
  }
}
