// ==============================================================================
// GHITA CODING AGENT — Unit Tests for Phase 6 Relay Server (In-Memory Mocking)
// ==============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Initialize global registries on globalThis to share across Vitest module boundaries
(globalThis as any).activeSockets = (globalThis as any).activeSockets || new Map<string, any>();
// Do not overwrite connectionHandler if already set by hoisted ESM imports
(globalThis as any).connectionHandler = (globalThis as any).connectionHandler || null;

// Import the relay server (it will use our mocked socket.io Server from alias)
import { pairings, socketMeta, eventCounts } from '../../packages/relay-server/src/index.js';

// Helper to create a mock socket object
function createMockSocket(id: string) {
  const handlers = new Map<string, (...args: any[]) => void>();
  let wildcardHandler: ((event: string, ...args: any[]) => void) | null = null;

  const mockSocket = {
    id,
    handshake: { address: '127.0.0.1' },
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler);
      return mockSocket;
    }),
    onAny: vi.fn((handler: (event: string, ...args: any[]) => void) => {
      wildcardHandler = handler;
      return mockSocket;
    }),
    // Test helper to simulate incoming events to this socket
    trigger: (event: string, ...args: any[]) => {
      const handler = handlers.get(event);
      if (handler) {
        handler(...args);
      }
      // Also invoke wildcard handler if registered and not a built-in event
      if (wildcardHandler) {
        wildcardHandler(event, ...args);
      }
    },
  };

  (globalThis as any).activeSockets.set(id, mockSocket);
  return mockSocket;
}

describe('Phase 6 - Cross-Network Socket.IO Relay Server', () => {
  beforeEach(() => {
    (globalThis as any).activeSockets.clear();
    pairings.clear();
    socketMeta.clear();
    eventCounts.clear();
  });

  it('should allow Desktop and Mobile pairing with matching code', () => {
    const handler = (globalThis as any).connectionHandler;
    expect(handler).toBeDefined();
    expect(handler).not.toBeNull();
    
    const desktopSocket = createMockSocket('desktop-123');
    const mobileSocket = createMockSocket('mobile-456');

    // Simulate socket.io connection event
    handler(desktopSocket);
    handler(mobileSocket);

    // 2. Register desktop and mobile with same code
    const code = 'MATCH6';
    desktopSocket.trigger('register_desktop', { pairingCode: code });
    mobileSocket.trigger('pair_mobile', { pairingCode: code });

    // 3. Verify they are paired via relay
    expect(desktopSocket.emit).toHaveBeenCalledWith('pair_confirm', {
      status: 'paired_via_relay',
      peerId: 'mobile-456',
    });
    expect(mobileSocket.emit).toHaveBeenCalledWith('pair_confirm', {
      status: 'paired_via_relay',
      peerId: 'desktop-123',
    });

    // 4. Verify internal mappings
    expect(pairings.has(code)).toBe(true);
    const pair = pairings.get(code);
    expect(pair?.desktopSocketId).toBe('desktop-123');
    expect(pair?.mobileSocketId).toBe('mobile-456');
  });

  it('should forward custom events bidirectionally between paired devices', () => {
    const handler = (globalThis as any).connectionHandler;
    const desktopSocket = createMockSocket('desktop-123');
    const mobileSocket = createMockSocket('mobile-456');

    handler(desktopSocket);
    handler(mobileSocket);

    const code = 'BRIDGE6';
    desktopSocket.trigger('register_desktop', { pairingCode: code });
    mobileSocket.trigger('pair_mobile', { pairingCode: code });

    // Clear initial pairing confirmations calls
    desktopSocket.emit.mockClear();
    mobileSocket.emit.mockClear();

    // Test Mobile to Desktop forwarding
    mobileSocket.trigger('ralph_loop_run', { task: 'install python package' });
    expect(desktopSocket.emit).toHaveBeenCalledWith('ralph_loop_run', {
      task: 'install python package',
    });

    // Test Desktop to Mobile forwarding
    desktopSocket.trigger('chat', { message: 'Hello from desktop agent!' });
    expect(mobileSocket.emit).toHaveBeenCalledWith('chat', {
      message: 'Hello from desktop agent!',
    });
  });

  it('should notify the other peer when one disconnects', () => {
    const handler = (globalThis as any).connectionHandler;
    const desktopSocket = createMockSocket('desktop-123');
    const mobileSocket = createMockSocket('mobile-456');

    handler(desktopSocket);
    handler(mobileSocket);

    const code = 'DISC6';
    desktopSocket.trigger('register_desktop', { pairingCode: code });
    mobileSocket.trigger('pair_mobile', { pairingCode: code });

    // Disconnect desktop
    desktopSocket.trigger('disconnect', 'transport close');

    // Mobile should receive disconnect_peer notification
    expect(mobileSocket.emit).toHaveBeenCalledWith('disconnect_peer', {
      reason: 'Desktop offline',
    });

    // Pairings should clean up
    const pair = pairings.get(code);
    expect(pair?.desktopSocketId).toBeUndefined();
    expect(pair?.mobileSocketId).toBe('mobile-456');
  });

  it('should enforce rate limits and drop excessive events', () => {
    const handler = (globalThis as any).connectionHandler;
    const desktopSocket = createMockSocket('desktop-123');
    const mobileSocket = createMockSocket('mobile-456');

    handler(desktopSocket);
    handler(mobileSocket);

    const code = 'LIMIT6';
    desktopSocket.trigger('register_desktop', { pairingCode: code });
    mobileSocket.trigger('pair_mobile', { pairingCode: code });

    // Send 35 events (Rate limit is 30)
    for (let i = 0; i < 35; i++) {
      mobileSocket.trigger('chat', { message: `spam-${i}` });
    }

    // Check that we got error for rate limit exceeded
    expect(mobileSocket.emit).toHaveBeenCalledWith('error', {
      message: 'Rate limit exceeded',
    });
  });
});
