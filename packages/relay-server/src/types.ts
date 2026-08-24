// @ghita/relay-server -- Type Definitions

export interface RelayConfig {
  readonly port: number;
  readonly maxRooms: number;
  readonly maxConnectionsPerRoom: number;
  readonly pingIntervalMs: number;
}

export interface RelayRoom {
  readonly id: string;
  readonly createdAt: string;
  readonly connections: readonly string[];
}

export interface RelayMessage {
  readonly from: string;
  readonly to: string | '*';
  readonly type: string;
  readonly payload: unknown;
}
