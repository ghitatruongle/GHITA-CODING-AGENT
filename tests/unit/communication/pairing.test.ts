import { describe, it, expect } from 'vitest';
import { PairingManager } from '@ghita/communication';

describe('Communication - Pairing', () => {
  it('should generate a 6-character pairing code', () => {
    const manager = new PairingManager();
    const code = manager.getCode();
    expect(code).toBeDefined();
    expect(code.length).toBe(6);
  });

  it('should return active state with expiry', () => {
    const manager = new PairingManager(300_000);
    const state = manager.getState();
    expect(state.code).toBeDefined();
    expect(state.isActive).toBe(true);
    expect(state.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should validate correct pairing code', () => {
    const manager = new PairingManager();
    const code = manager.getCode();
    expect(manager.validate(code)).toBe(true);
  });

  it('should reject incorrect pairing code', () => {
    const manager = new PairingManager();
    manager.validate('XXXXXX'); // consume one attempt first
    expect(manager.validate('000000')).toBe(false);
  });

  it('should reject expired codes', async () => {
    const manager = new PairingManager(1); // 1ms TTL
    const code = manager.getCode();
    await new Promise((r) => setTimeout(r, 10));
    expect(manager.validate(code)).toBe(false);
  });

  it('should regenerate a new code on explicit regenerate', () => {
    const manager = new PairingManager();
    const oldCode = manager.getCode();
    manager.regenerate();
    const newCode = manager.getCode();
    expect(newCode).not.toBe(oldCode);
  });
});
