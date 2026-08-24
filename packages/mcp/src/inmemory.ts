// Implements the SDK `Transport` contract with two linked ends, mirroring the
// SDK's internal in-memory transport (which is not part of the public exports
// of the installed SDK version). Used by tests and embedded pair mode.

import { EventEmitter } from 'node:events';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

class InMemoryLink implements Transport {
  private peer: InMemoryLink | null = null;
  private readonly emitter = new EventEmitter();
  closed = false;

  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor() {
    this.emitter.on('message', (m: JSONRPCMessage) => this.onmessage?.(m));
    this.emitter.on('close', () => this.onclose?.());
  }

  setPeer(peer: InMemoryLink): void {
    this.peer = peer;
  }

  async start(): Promise<void> {
    // No-op: both ends are already wired.
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed || !this.peer) return;
    this.peer.emitter.emit('message', message);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.peer?.emitter.emit('close');
    this.emitter.emit('close');
  }
}

/** Create a linked [client, server] transport pair over in-memory. */
export function createLinkedPair(): [Transport, Transport] {
  const a = new InMemoryLink();
  const b = new InMemoryLink();
  a.setPeer(b);
  b.setPeer(a);
  return [a, b];
}
