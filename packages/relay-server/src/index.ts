// ==============================================================================
// GHITA CODING AGENT — WAN Socket.io Relay Server
// Transparent bridge forwarding all events between paired desktop & mobile
// ==============================================================================

import express from 'express';
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const PORT = parseInt(process.env.PORT || '3002', 10);
const HOST = '0.0.0.0';

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    message: 'GHITA Cloud Relay Server is operational.'
  });
});

export const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 20000,
});

// Map of pairing codes to paired sockets
// pairingCode -> { desktopSocketId?, mobileSocketId? }
export const pairings = new Map<string, { desktopSocketId?: string; mobileSocketId?: string }>();

// Map of socket ID to their metadata
export const socketMeta = new Map<string, { role: 'desktop' | 'mobile'; pairingCode: string }>();

// Simple rate limiter tracking requests per socket
export const eventCounts = new Map<string, { count: number; lastReset: number }>();
export const RATE_LIMIT_EVENTS_PER_SEC = 30;

function checkRateLimit(socketId: string): boolean {
  const now = Date.now();
  const meta = eventCounts.get(socketId) || { count: 0, lastReset: now };

  if (now - meta.lastReset > 1000) {
    meta.count = 0;
    meta.lastReset = now;
  }

  meta.count++;
  eventCounts.set(socketId, meta);

  return meta.count <= RATE_LIMIT_EVENTS_PER_SEC;
}

function getPeerSocket(socket: Socket): Socket | null {
  const meta = socketMeta.get(socket.id);
  if (!meta) return null;

  const pair = pairings.get(meta.pairingCode);
  if (!pair) return null;

  const peerId = meta.role === 'desktop' ? pair.mobileSocketId : pair.desktopSocketId;
  if (!peerId) return null;

  return io.sockets.sockets.get(peerId) || null;
}

io.on('connection', (socket: Socket) => {
  const clientIp = socket.handshake.address;
  console.log(`[Relay] New connection: ${socket.id} from ${clientIp}`);

  // Register desktop client
  socket.on('register_desktop', (data: { pairingCode: string }) => {
    const rawCode = data?.pairingCode;
    if (!rawCode) {
      socket.emit('error', { message: 'Pairing code is required for desktop registration' });
      return;
    }
    const code = rawCode.toUpperCase().trim();

    // Clean up previous registration for this socket if any
    const existingMeta = socketMeta.get(socket.id);
    if (existingMeta) {
      console.log(`[Relay] Removing prior registration for desktop socket ${socket.id}`);
      const prevPair = pairings.get(existingMeta.pairingCode);
      if (prevPair && prevPair.desktopSocketId === socket.id) {
        delete prevPair.desktopSocketId;
      }
    }

    // Register desktop
    const pair = pairings.get(code) || {};
    
    // If another desktop was registered on this code, notify or replace
    if (pair.desktopSocketId && pair.desktopSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(pair.desktopSocketId);
      if (oldSocket) {
        console.log(`[Relay] Displacing old desktop socket ${pair.desktopSocketId} on code ${code}`);
        oldSocket.emit('error', { message: 'Displaced by another desktop session' });
        oldSocket.disconnect(true);
      }
    }

    pair.desktopSocketId = socket.id;
    pairings.set(code, pair);
    socketMeta.set(socket.id, { role: 'desktop', pairingCode: code });

    console.log(`[Relay] Desktop registered on code ${code}. Socket: ${socket.id}`);

    // If mobile is already waiting, bridge them
    if (pair.mobileSocketId) {
      console.log(`[Relay] Pairing desktop & mobile immediately on code ${code}`);
      const mobileSocket = io.sockets.sockets.get(pair.mobileSocketId);
      if (mobileSocket) {
        socket.emit('pair_confirm', { status: 'paired_via_relay', peerId: pair.mobileSocketId });
        mobileSocket.emit('pair_confirm', { status: 'paired_via_relay', peerId: socket.id });
      }
    }
  });

  // Register mobile client
  socket.on('pair_mobile', (data: { pairingCode: string }) => {
    const rawCode = data?.pairingCode;
    if (!rawCode) {
      socket.emit('error', { message: 'Pairing code is required for mobile pairing' });
      return;
    }
    const code = rawCode.toUpperCase().trim();

    // Clean up previous registration for this socket if any
    const existingMeta = socketMeta.get(socket.id);
    if (existingMeta) {
      console.log(`[Relay] Removing prior registration for mobile socket ${socket.id}`);
      const prevPair = pairings.get(existingMeta.pairingCode);
      if (prevPair && prevPair.mobileSocketId === socket.id) {
        delete prevPair.mobileSocketId;
      }
    }

    // Register mobile
    const pair = pairings.get(code) || {};
    
    // If another mobile was registered on this code, replace
    if (pair.mobileSocketId && pair.mobileSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(pair.mobileSocketId);
      if (oldSocket) {
        console.log(`[Relay] Displacing old mobile socket ${pair.mobileSocketId} on code ${code}`);
        oldSocket.emit('error', { message: 'Displaced by another mobile session' });
        oldSocket.disconnect(true);
      }
    }

    pair.mobileSocketId = socket.id;
    pairings.set(code, pair);
    socketMeta.set(socket.id, { role: 'mobile', pairingCode: code });

    console.log(`[Relay] Mobile registered on code ${code}. Socket: ${socket.id}`);

    // If desktop is already waiting, bridge them
    if (pair.desktopSocketId) {
      console.log(`[Relay] Pairing mobile & desktop immediately on code ${code}`);
      const desktopSocket = io.sockets.sockets.get(pair.desktopSocketId);
      if (desktopSocket) {
        socket.emit('pair_confirm', { status: 'paired_via_relay', peerId: pair.desktopSocketId });
        desktopSocket.emit('pair_confirm', { status: 'paired_via_relay', peerId: socket.id });
      }
    } else {
      console.log(`[Relay] Mobile is waiting for desktop to register code ${code}`);
      socket.emit('waiting_for_desktop');
    }
  });

  // Wildcard Event Forwarding (Tunnel Bridge)
  socket.onAny((event: string, ...args: any[]) => {
    // 1. Rate limiting check
    if (!checkRateLimit(socket.id)) {
      console.warn(`[Relay] Socket ${socket.id} exceeded rate limit. Dropping event: ${event}`);
      socket.emit('error', { message: 'Rate limit exceeded' });
      return;
    }

    // 2. Ignore server control events
    if (['register_desktop', 'pair_mobile', 'disconnect', 'error', 'pair_confirm', 'waiting_for_desktop'].includes(event)) {
      return;
    }

    // 3. Forward to peer socket if paired
    const peer = getPeerSocket(socket);
    if (peer) {
      // console.log(`[Relay] Forwarding event '${event}' from ${socket.id} to peer ${peer.id}`);
      peer.emit(event, ...args);
    } else {
      // If we don't have a peer, let mobile know
      const meta = socketMeta.get(socket.id);
      if (meta && meta.role === 'mobile' && event === 'pair') {
        socket.emit('error', { message: 'Desktop is currently offline. Please wait or check your desktop server.' });
      }
    }
  });

  // Disconnection cleanup
  socket.on('disconnect', (reason: string) => {
    console.log(`[Relay] Socket disconnected: ${socket.id}. Reason: ${reason}`);
    eventCounts.delete(socket.id);

    const meta = socketMeta.get(socket.id);
    if (meta) {
      const pair = pairings.get(meta.pairingCode);
      if (pair) {
        if (meta.role === 'desktop') {
          console.log(`[Relay] Cleaning up desktop registration on code ${meta.pairingCode}`);
          delete pair.desktopSocketId;
          // Notify mobile peer of disconnection
          if (pair.mobileSocketId) {
            const mobileSocket = io.sockets.sockets.get(pair.mobileSocketId);
            if (mobileSocket) {
              mobileSocket.emit('disconnect_peer', { reason: 'Desktop offline' });
            }
          }
        } else {
          console.log(`[Relay] Cleaning up mobile registration on code ${meta.pairingCode}`);
          delete pair.mobileSocketId;
          // Notify desktop peer of disconnection
          if (pair.desktopSocketId) {
            const desktopSocket = io.sockets.sockets.get(pair.desktopSocketId);
            if (desktopSocket) {
              desktopSocket.emit('disconnect_peer', { reason: 'Mobile offline' });
            }
          }
        }

        // Remove pair if both are empty
        if (!pair.desktopSocketId && !pair.mobileSocketId) {
          pairings.delete(meta.pairingCode);
        }
      }
      socketMeta.delete(socket.id);
    }
  });
});

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, HOST, () => {
    console.log(`[Relay] Server listening on http://${HOST}:${PORT}`);
    console.log(`[Relay] Health endpoint: http://${HOST}:${PORT}/health`);
  });
}
