// ==============================================================================
// GHITA CODING AGENT — Socket.IO Mock for Phase 6 Relay Server Tests
// ==============================================================================

import { vi } from 'vitest';

export class Server {
  sockets = {
    sockets: {
      get: (id: string) => {
        const socketsMap = (globalThis as any).activeSockets;
        return socketsMap ? socketsMap.get(id) : null;
      },
    },
  };

  on(event: string, handler: (socket: any) => void) {
    if (event === 'connection') {
      (globalThis as any).connectionHandler = handler;
    }
    return this;
  }
}

export type Socket = any;
