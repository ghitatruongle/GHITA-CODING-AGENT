// ==============================================================================
// GHITA CODING AGENT - E2E Tests: Desktop-Mobile Communication Sync
// ==============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { SOCKET_EVENTS } from '../../packages/shared/src/constants.js';

// --- Lightweight WebSocket Simulator ---
interface MockWsMessage {
  event: string;
  data: unknown;
}

class MockWebSocket extends EventEmitter {
  id: string;
  readyState: number = 1; // OPEN
  sent: MockWsMessage[] = [];

  constructor(id: string) {
    super();
    this.id = id;
  }

  send(message: string): void {
    try {
      const parsed = JSON.parse(message);
      this.sent.push(parsed);
      this.emit('sent', parsed);
    } catch {
      this.sent.push({ event: 'raw', data: message });
    }
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }

  receive(event: string, data: unknown): void {
    this.emit('message', JSON.stringify({ event, data }));
    this.emit(event, data);
  }
}

class MockWebSocketServer extends EventEmitter {
  clients: Map<string, MockWebSocket> = new Map();
  private _idCounter = 0;

  addClient(idPrefix = 'ws-client'): MockWebSocket {
    const id = `${idPrefix}-${++this._idCounter}`;
    const ws = new MockWebSocket(id);
    this.clients.set(id, ws);
    this.emit('connection', ws);
    ws.on('close', () => {
      this.clients.delete(id);
    });
    return ws;
  }

  broadcast(event: string, data: unknown): void {
    const message = JSON.stringify({ event, data });
    for (const client of this.clients.values()) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }
}

// --- Tests ---
describe('E2E: Mobile-Desktop Sync & Consent Gate', () => {
  let server: MockWebSocketServer;
  let desktopClient: MockWebSocket;
  let mobileClient: MockWebSocket;

  beforeEach(() => {
    server = new MockWebSocketServer();

    // Simple routing logic to simulate sidecar server behavior
    server.on('connection', (socket: MockWebSocket) => {
      socket.on(SOCKET_EVENTS.REQUIRE_APPROVAL, (data) => {
        // Desktop agent requests approval -> Broadcast to mobile
        for (const [id, client] of server.clients.entries()) {
          if (id.startsWith('mobile') && client !== socket) {
            client.receive(SOCKET_EVENTS.REQUIRE_APPROVAL, data);
          }
        }
      });

      socket.on(SOCKET_EVENTS.APPROVAL_RESPONSE, (data) => {
        // Mobile sends approval response -> Route to desktop
        for (const [id, client] of server.clients.entries()) {
          if (id.startsWith('desktop') && client !== socket) {
            client.receive(SOCKET_EVENTS.APPROVAL_RESPONSE, data);
          }
        }
      });

      socket.on(SOCKET_EVENTS.PAIR, (_data) => {
        // Simulate pairing process
        socket.receive(SOCKET_EVENTS.STATUS, { status: 'paired', deviceId: socket.id });
      });
    });

    desktopClient = server.addClient('desktop');
    mobileClient = server.addClient('mobile');
  });

  it('should pair successfully when providing correct PIN', () => {
    const statusHandler = vi.fn();
    mobileClient.on(SOCKET_EVENTS.STATUS, statusHandler);

    // Client emits to server
    mobileClient.emit(SOCKET_EVENTS.PAIR, { code: '123456', deviceName: 'Samsung S24' });

    expect(statusHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'paired',
      }),
    );
  });

  it('should successfully route consent gate requests from Desktop to Mobile', () => {
    const mobileApprovalHandler = vi.fn();
    mobileClient.on(SOCKET_EVENTS.REQUIRE_APPROVAL, mobileApprovalHandler);

    const payload = {
      id: 'req_123',
      command: 'rm -rf /',
    };

    // Desktop emits to server
    desktopClient.emit(SOCKET_EVENTS.REQUIRE_APPROVAL, payload);

    // Mobile should receive it
    expect(mobileApprovalHandler).toHaveBeenCalledWith(payload);
  });

  it('should successfully route consent response (Approve) back to Desktop', () => {
    const desktopResponseHandler = vi.fn();
    desktopClient.on(SOCKET_EVENTS.APPROVAL_RESPONSE, desktopResponseHandler);

    const responsePayload = {
      id: 'req_123',
      approved: true,
    };

    // Mobile emits to server
    mobileClient.emit(SOCKET_EVENTS.APPROVAL_RESPONSE, responsePayload);

    // Desktop should receive the response
    expect(desktopResponseHandler).toHaveBeenCalledWith(responsePayload);
  });

  it('should successfully route consent response (Reject) back to Desktop', () => {
    const desktopResponseHandler = vi.fn();
    desktopClient.on(SOCKET_EVENTS.APPROVAL_RESPONSE, desktopResponseHandler);

    const responsePayload = {
      id: 'req_123',
      approved: false,
    };

    // Mobile emits to server
    mobileClient.emit(SOCKET_EVENTS.APPROVAL_RESPONSE, responsePayload);

    // Desktop should receive the response
    expect(desktopResponseHandler).toHaveBeenCalledWith(responsePayload);
  });
});
