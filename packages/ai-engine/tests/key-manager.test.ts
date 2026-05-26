import { describe, it, expect } from 'vitest';
import { KeyManager } from '../src/key-manager.js';

describe('KeyManager', () => {
  describe('constructor', () => {
    it('should initialize with provided keys', () => {
      const km = new KeyManager(['key1', 'key2', 'key3']);
      expect(km.size).toBe(3);
      expect(km.hasHealthyKey()).toBe(true);
    });

    it('should filter empty keys', () => {
      const km = new KeyManager(['key1', '', '  ', 'key2']);
      expect(km.size).toBe(2);
    });

    it('should default to failover strategy', () => {
      const km = new KeyManager(['key1']);
      const status = km.getHealthStatus();
      expect(status.strategy).toBe('failover');
    });
  });

  describe('getNextKey - failover', () => {
    it('should return first healthy key', () => {
      const km = new KeyManager(['key1', 'key2', 'key3'], 'failover');
      expect(km.getNextKey()).toBe('key1');
    });

    it('should skip deactivated keys', () => {
      const km = new KeyManager(['key1', 'key2'], 'failover');
      km.reportFailure('key1', 401); // deactivates
      expect(km.getNextKey()).toBe('key2');
    });

    it('should return null when all keys deactivated', () => {
      const km = new KeyManager(['key1'], 'failover');
      km.reportFailure('key1', 401);
      expect(km.getNextKey()).toBeNull();
    });
  });

  describe('getNextKey - round-robin', () => {
    it('should cycle through keys', () => {
      const km = new KeyManager(['key1', 'key2', 'key3'], 'round-robin');
      expect(km.getNextKey()).toBe('key1');
      expect(km.getNextKey()).toBe('key2');
      expect(km.getNextKey()).toBe('key3');
      expect(km.getNextKey()).toBe('key1'); // wraps
    });
  });

  describe('getNextKey - random', () => {
    it('should return a valid key', () => {
      const km = new KeyManager(['key1', 'key2'], 'random');
      const key = km.getNextKey();
      expect(['key1', 'key2']).toContain(key);
    });
  });

  describe('reportSuccess', () => {
    it('should reset consecutive failures', () => {
      const km = new KeyManager(['key1']);
      km.reportFailure('key1');
      km.reportFailure('key1');
      km.reportSuccess('key1');
      const status = km.getHealthStatus();
      expect(status.keyStats[0]!.consecutiveFailures).toBe(0);
      expect(status.keyStats[0]!.totalRequests).toBe(3); // 2 failures + 1 success
    });
  });

  describe('reportFailure', () => {
    it('should deactivate on 401', () => {
      const km = new KeyManager(['key1']);
      km.reportFailure('key1', 401);
      expect(km.hasHealthyKey()).toBe(false);
    });

    it('should cooldown on 429', () => {
      const km = new KeyManager(['key1']);
      km.reportFailure('key1', 429);
      const status = km.getHealthStatus();
      expect(status.keyStats[0]!.isCoolingDown).toBe(true);
      expect(status.coolDownKeys).toBe(1);
    });

    it('should deactivate after 3 consecutive failures', () => {
      const km = new KeyManager(['key1']);
      km.reportFailure('key1');
      km.reportFailure('key1');
      km.reportFailure('key1');
      expect(km.hasHealthyKey()).toBe(false);
    });
  });

  describe('addKey / removeKey', () => {
    it('should add a new key', () => {
      const km = new KeyManager(['key1']);
      expect(km.addKey('key2')).toBe(true);
      expect(km.size).toBe(2);
    });

    it('should reject duplicate key', () => {
      const km = new KeyManager(['key1']);
      expect(km.addKey('key1')).toBe(false);
    });

    it('should remove a key', () => {
      const km = new KeyManager(['key1', 'key2']);
      expect(km.removeKey('key1')).toBe(true);
      expect(km.size).toBe(1);
    });
  });

  describe('resetKey', () => {
    it('should reactivate a deactivated key', () => {
      const km = new KeyManager(['key1']);
      km.reportFailure('key1', 401);
      expect(km.hasHealthyKey()).toBe(false);
      km.resetKey('key1');
      expect(km.hasHealthyKey()).toBe(true);
    });
  });

  describe('getHealthStatus', () => {
    it('should mask key prefixes', () => {
      const km = new KeyManager(['abcdefghijklmnop']);
      const status = km.getHealthStatus();
      expect(status.keyStats[0]!.keyPrefix).toContain('abcd');
      expect(status.keyStats[0]!.keyPrefix).toContain('mnop');
      expect(status.keyStats[0]!.keyPrefix).not.toContain('efgh');
    });
  });
});
