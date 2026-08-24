// @ghita/relay-server -- Comprehensive Tests

import { describe, it, expect, beforeEach } from 'vitest';
import { RelayServer } from '../server.js';
import { RoomManager } from '../room-manager.js';
import { ConnectionBroker } from '../connection-broker.js';
import { RateLimiter } from '../rate-limiter.js';

// RateLimiter

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(3, 60_000);
  });

  it('allows requests under limit', () => {
    expect(limiter.check('key')).toBe(true);
    expect(limiter.check('key')).toBe(true);
    expect(limiter.check('key')).toBe(true);
  });

  it('blocks requests over limit', () => {
    limiter.check('key');
    limiter.check('key');
    limiter.check('key');
    expect(limiter.check('key')).toBe(false);
  });

  it('tracks count per key', () => {
    limiter.check('a');
    limiter.check('a');
    limiter.check('b');
    expect(limiter.getCount('a')).toBe(2);
    expect(limiter.getCount('b')).toBe(1);
  });

  it('resets key', () => {
    limiter.check('key');
    limiter.check('key');
    limiter.reset('key');
    expect(limiter.getCount('key')).toBe(0);
    expect(limiter.check('key')).toBe(true);
  });
});

// RoomManager

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager(10);
  });

  it('creates a room', () => {
    const room = manager.createRoom('room-1');
    expect(room.id).toBe('room-1');
    expect(room.connections).toEqual([]);
    expect(manager.roomCount()).toBe(1);
  });

  it('joins a room', () => {
    manager.createRoom('room-1');
    manager.joinRoom('room-1', 'conn-1');
    const room = manager.getRoom('room-1');
    expect(room?.connections).toEqual(['conn-1']);
  });

  it('throws when joining non-existent room', () => {
    expect(() => manager.joinRoom('unknown', 'conn-1')).toThrow('Room not found');
  });

  it('does not duplicate connections', () => {
    manager.createRoom('room-1');
    manager.joinRoom('room-1', 'conn-1');
    manager.joinRoom('room-1', 'conn-1');
    const room = manager.getRoom('room-1');
    expect(room?.connections).toEqual(['conn-1']);
  });

  it('leaves a room', () => {
    manager.createRoom('room-1');
    manager.joinRoom('room-1', 'conn-1');
    manager.joinRoom('room-1', 'conn-2');
    manager.leaveRoom('room-1', 'conn-1');
    const room = manager.getRoom('room-1');
    expect(room?.connections).toEqual(['conn-2']);
  });

  it('deletes room when last connection leaves', () => {
    manager.createRoom('room-1');
    manager.joinRoom('room-1', 'conn-1');
    manager.leaveRoom('room-1', 'conn-1');
    expect(manager.roomCount()).toBe(0);
    expect(manager.getRoom('room-1')).toBeUndefined();
  });

  it('throws when max rooms reached', () => {
    const mgr = new RoomManager(2);
    mgr.createRoom('a');
    mgr.createRoom('b');
    expect(() => mgr.createRoom('c')).toThrow('Maximum rooms reached');
  });

  it('returns undefined for non-existent room', () => {
    expect(manager.getRoom('unknown')).toBeUndefined();
  });
});

// ConnectionBroker

describe('ConnectionBroker', () => {
  let broker: ConnectionBroker;

  beforeEach(() => {
    broker = new ConnectionBroker();
  });

  it('registers and checks connections', () => {
    broker.register('conn-1');
    expect(broker.isConnected('conn-1')).toBe(true);
    expect(broker.isConnected('conn-2')).toBe(false);
  });

  it('unregisters connections', () => {
    broker.register('conn-1');
    broker.unregister('conn-1');
    expect(broker.isConnected('conn-1')).toBe(false);
  });

  it('sets and gets room', () => {
    broker.register('conn-1');
    broker.setRoom('conn-1', 'room-1');
    expect(broker.getRoom('conn-1')).toBe('room-1');
  });

  it('returns undefined for unknown room', () => {
    expect(broker.getRoom('unknown')).toBeUndefined();
  });

  it('counts connections', () => {
    broker.register('a');
    broker.register('b');
    expect(broker.count()).toBe(2);
  });
});

// RelayServer

describe('RelayServer', () => {
  let server: RelayServer;

  beforeEach(() => {
    server = new RelayServer({
      port: 8080,
      maxRooms: 100,
      maxConnectionsPerRoom: 10,
      pingIntervalMs: 30_000,
    });
  });

  it('returns config', () => {
    const config = server.getConfig();
    expect(config.port).toBe(8080);
    expect(config.maxRooms).toBe(100);
  });

  it('passes message through when under rate limit', () => {
    const msg = { from: 'user-1', to: '*', type: 'ping', payload: {} };
    const result = server.handleMessage(msg);
    expect(result).toEqual(msg);
  });

  it('blocks message when rate limited', () => {
    for (let i = 0; i < 100; i++) {
      server.handleMessage({ from: 'user-1', to: '*', type: 'msg', payload: {} });
    }
    const result = server.handleMessage({ from: 'user-1', to: '*', type: 'msg', payload: {} });
    expect(result).toBeNull();
  });

  it('has rooms, connections, and rateLimiter', () => {
    expect(server.rooms).toBeInstanceOf(RoomManager);
    expect(server.connections).toBeInstanceOf(ConnectionBroker);
    expect(server.rateLimiter).toBeInstanceOf(RateLimiter);
  });
});
