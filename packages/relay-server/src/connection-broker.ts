// ==============================================================================
// @ghita/relay-server -- Connection Broker
// ==============================================================================

export class ConnectionBroker {
  private readonly connections = new Map<string, { connectedAt: number; roomId?: string }>();

  register(id: string): void {
    this.connections.set(id, { connectedAt: Date.now() });
  }

  unregister(id: string): void {
    this.connections.delete(id);
  }

  setRoom(id: string, roomId: string): void {
    const conn = this.connections.get(id);
    if (conn) conn.roomId = roomId;
  }

  getRoom(id: string): string | undefined {
    return this.connections.get(id)?.roomId;
  }

  count(): number {
    return this.connections.size;
  }

  isConnected(id: string): boolean {
    return this.connections.has(id);
  }
}
