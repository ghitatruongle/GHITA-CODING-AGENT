// @ghita/relay-server -- Room Manager

import type { RelayRoom } from './types.js';

export class RoomManager {
  private readonly rooms = new Map<string, { id: string; createdAt: string; connections: string[] }>();

  constructor(private readonly maxRooms: number) {}

  createRoom(id: string): RelayRoom {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Maximum rooms reached');
    }
    const room = { id, createdAt: new Date().toISOString(), connections: [] as string[] };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(roomId: string, connectionId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);
    if (room.connections.includes(connectionId)) return;
    room.connections.push(connectionId);
  }

  leaveRoom(roomId: string, connectionId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.connections = room.connections.filter((c) => c !== connectionId);
    if (room.connections.length === 0) {
      this.rooms.delete(roomId);
    }
  }

  getRoom(id: string): RelayRoom | undefined {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    return { id: room.id, createdAt: room.createdAt, connections: [...room.connections] };
  }

  roomCount(): number {
    return this.rooms.size;
  }
}
