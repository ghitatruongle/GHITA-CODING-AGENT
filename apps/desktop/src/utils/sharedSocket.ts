// =============================================================================
// Shared Socket — Singleton socket.io connection to sidecar server
// =============================================================================
// All components (ChatPanel, SkillManager, etc.) should use this shared socket
// instead of creating their own connections. This eliminates 2-3 duplicate
// WebSocket connections and their associated overhead.

import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { invoke } from '@tauri-apps/api/core';

let socket: Socket | null = null;
let connectionPromise: Promise<Socket | null> | null = null;

// Generate a session token for basic socket-level auth/CSRF protection
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_TOKEN = generateSessionToken();

/**
 * Get or create the shared socket connection to the sidecar server.
 * Returns null if the server is not available.
 */
export async function getSharedSocket(): Promise<Socket | null> {
  if (socket?.connected) return socket;

  // Disconnect stale socket before creating a new one
  if (socket && !socket.connected) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  // Deduplicate concurrent connection attempts
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const status = await invoke<{ port: number }>('get_server_status');
      const port = status.port || 8080;

      socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        auth: { token: SESSION_TOKEN },
      });

      const sock = socket;

      // Wait for connection or timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        sock.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        sock.once('connect_error', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      return socket;
    } catch (err) {
      console.error('[sharedSocket] Failed to connect:', err);
      return null;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Get the current socket instance (may be null if not connected).
 */
export function getCurrentSocket(): Socket | null {
  return socket;
}
