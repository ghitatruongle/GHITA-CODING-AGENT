// Shared Socket — Singleton socket.io connection to sidecar server

// All components (ChatPanel, SkillManager, etc.) should use this shared socket
// instead of creating their own connections. This eliminates 2-3 duplicate
// WebSocket connections and their associated overhead.

import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';

let socket: Socket | null = null;
let connectionPromise: Promise<Socket | null> | null = null;

/**
 * Get or create the shared socket connection to the sidecar server.
 * Returns null if the server is not available.
 *
 * The socket instance is created ONCE for the app lifetime and relies on
 * socket.io's built-in reconnection. Destroying and replacing a disconnected
 * instance would invalidate every consumer's saved ref and silently drop
 * their registered listeners.
 */
export async function getSharedSocket(): Promise<Socket | null> {
  if (socket) return socket;

  // Deduplicate concurrent connection attempts
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const status = await invoke<{ port: number }>('get_server_status');
      const port = status.port || 39001;

      const sessionToken = await invoke<string>('get_session_token').catch((e) => {
        console.warn('[sharedSocket] get_session_token failed, using empty token:', e);
        return '';
      });

      socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        auth: { token: sessionToken },
      });

      // Automatically sync active workspace on connection/reconnection
      socket.on('connect', () => {
        const cwd = useAppStore.getState().terminalCwd;
        if (socket) {
          socket.emit('set_workspace', { path: cwd || null });
        }
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
