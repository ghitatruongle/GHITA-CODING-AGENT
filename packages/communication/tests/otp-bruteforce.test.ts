// ==============================================================================
// GHITA CODING AGENT — OTP Brute-Force Protection Unit Tests
// ==============================================================================
// Tests for TelepresencePortal.verifyOTP security hardening:
//   - OTP expiry (10-minute window)
//   - Per-socket attempt limit (5 max)
//   - Global lockout after 20 cumulative failures (5-minute cooldown)
//   - OTP format validation on setOTP
//   - Successful authentication resets attempt counters
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelepresencePortal } from '../src/channels/telepresencePortal.js';

vi.mock('sharp', () => ({
  default: vi.fn().mockImplementation(() => ({
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock')),
  })),
}));

/** Minimal mock socket matching the subset of net.Socket used by verifyOTP */
function createMockSocket(): { destroyed: boolean; write: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  return { destroyed: false, write: vi.fn(), destroy: vi.fn() };
}

describe('TelepresencePortal — OTP Brute-Force Protection', () => {
  let portal: TelepresencePortal;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    portal = new TelepresencePortal(0, 'TEST_PASSWORD');
  });

  afterEach(async () => {
    await portal.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. OTP Expiry
  // ---------------------------------------------------------------------------
  describe('OTP Expiry (10-minute window)', () => {
    it('should accept OTP within the expiry window', () => {
      portal.setOTP('123456');
      const socket = createMockSocket();

      // Advance 5 minutes — still valid
      vi.advanceTimersByTime(5 * 60 * 1000);

      const result = portal.verifyOTP(socket as any, '123456');
      expect(result).toBe(true);
      expect(portal.isClientAuthenticated(socket as any)).toBe(true);
    });

    it('should reject OTP exactly at the expiry boundary (10 min)', () => {
      portal.setOTP('123456');
      const socket = createMockSocket();

      // Advance exactly 10 minutes + 1ms
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);

      const result = portal.verifyOTP(socket as any, '123456');
      expect(result).toBe(false);
      expect(portal.isClientAuthenticated(socket as any)).toBe(false);
    });

    it('should reject OTP well past the expiry window (1 hour)', () => {
      portal.setOTP('654321');
      const socket = createMockSocket();

      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      const result = portal.verifyOTP(socket as any, '654321');
      expect(result).toBe(false);
    });

    it('should invalidate the OTP code after expiry so it cannot be reused', () => {
      portal.setOTP('111111');
      vi.advanceTimersByTime(11 * 60 * 1000); // 11 min — expired

      const socket = createMockSocket();
      portal.verifyOTP(socket as any, '111111');
      // Internal otpCode should have been cleared
      expect(portal.getOTP()).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Per-Socket Attempt Limit (max 5)
  // ---------------------------------------------------------------------------
  describe('Per-Socket Attempt Limit (5 max)', () => {
    it('should block a socket after 5 failed attempts even with correct OTP on the 6th', () => {
      portal.setOTP('999999');
      const socket = createMockSocket();

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        const res = portal.verifyOTP(socket as any, '000000');
        expect(res).toBe(false);
      }

      // 6th attempt with the CORRECT code should still be rejected
      const result = portal.verifyOTP(socket as any, '999999');
      expect(result).toBe(false);
      expect(portal.isClientAuthenticated(socket as any)).toBe(false);
    });

    it('should allow up to 4 wrong attempts then succeed on the 5th with correct code', () => {
      portal.setOTP('555555');
      const socket = createMockSocket();

      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        portal.verifyOTP(socket as any, '000000');
      }

      // 5th attempt with correct code
      const result = portal.verifyOTP(socket as any, '555555');
      expect(result).toBe(true);
      expect(portal.isClientAuthenticated(socket as any)).toBe(true);
    });

    it('should track attempts independently per socket', () => {
      portal.setOTP('777777');
      const socketA = createMockSocket();
      const socketB = createMockSocket();

      // Socket A: 5 wrong attempts — locked out
      for (let i = 0; i < 5; i++) {
        portal.verifyOTP(socketA as any, '000000');
      }

      // Socket B: still has fresh attempts — should succeed
      const result = portal.verifyOTP(socketB as any, '777777');
      expect(result).toBe(true);
      expect(portal.isClientAuthenticated(socketB as any)).toBe(true);

      // Socket A remains locked out
      const lockedResult = portal.verifyOTP(socketA as any, '777777');
      expect(lockedResult).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Global Lockout (20 cumulative failures → 5-min cooldown)
  // ---------------------------------------------------------------------------
  describe('Global Lockout (20 failures → 5-min cooldown)', () => {
    it('should trigger global lockout after 20 total failed attempts across sockets', () => {
      portal.setOTP('888888');

      // Use 4 sockets × 5 attempts each = 20 total failures
      // Note: per-socket limit is 5, so each socket can contribute up to 5
      const sockets = Array.from({ length: 4 }, () => createMockSocket());

      for (const socket of sockets) {
        for (let i = 0; i < 5; i++) {
          portal.verifyOTP(socket as any, '000000');
        }
      }

      // A fresh socket should also be blocked by global lockout
      const freshSocket = createMockSocket();
      const result = portal.verifyOTP(freshSocket as any, '888888');
      expect(result).toBe(false);
      expect(portal.isClientAuthenticated(freshSocket as any)).toBe(false);
    });

    it('should allow authentication again after the 5-minute lockout expires', () => {
      portal.setOTP('888888');

      // Trigger 20 failures
      const sockets = Array.from({ length: 4 }, () => createMockSocket());
      for (const socket of sockets) {
        for (let i = 0; i < 5; i++) {
          portal.verifyOTP(socket as any, '000000');
        }
      }

      // Advance past the 5-minute lockout window
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Re-set the OTP since the old one may still be valid (within 10 min)
      portal.setOTP('888888');

      // A fresh socket should now succeed
      const freshSocket = createMockSocket();
      const result = portal.verifyOTP(freshSocket as any, '888888');
      expect(result).toBe(true);
      expect(portal.isClientAuthenticated(freshSocket as any)).toBe(true);
    });

    it('should reset global attempt counter after lockout is triggered', () => {
      portal.setOTP('333333');

      // 20 failures to trigger lockout
      const sockets = Array.from({ length: 4 }, () => createMockSocket());
      for (const socket of sockets) {
        for (let i = 0; i < 5; i++) {
          portal.verifyOTP(socket as any, '000000');
        }
      }

      // Internal counter should be reset to 0 after lockout triggers
      expect((portal as any).otpGlobalAttempts).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. OTP Format Validation
  // ---------------------------------------------------------------------------
  describe('OTP Format Validation (setOTP)', () => {
    it('should accept a valid 6-digit OTP', () => {
      expect(() => portal.setOTP('000000')).not.toThrow();
      expect(portal.getOTP()).toBe('000000');
    });

    it('should reject OTP with fewer than 6 digits', () => {
      expect(() => portal.setOTP('12345')).toThrow('OTP must be exactly 6 digits');
    });

    it('should reject OTP with more than 6 digits', () => {
      expect(() => portal.setOTP('1234567')).toThrow('OTP must be exactly 6 digits');
    });

    it('should reject OTP containing non-digit characters', () => {
      expect(() => portal.setOTP('12ab56')).toThrow('OTP must be exactly 6 digits');
    });

    it('should reject empty string OTP', () => {
      expect(() => portal.setOTP('')).toThrow('OTP must be exactly 6 digits');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Successful Authentication Resets Counters
  // ---------------------------------------------------------------------------
  describe('Successful Authentication Resets State', () => {
    it('should clear per-socket attempt counter on successful verification', () => {
      portal.setOTP('444444');
      const socket = createMockSocket();

      // 3 wrong attempts
      for (let i = 0; i < 3; i++) {
        portal.verifyOTP(socket as any, '000000');
      }

      // Correct attempt succeeds
      const result = portal.verifyOTP(socket as any, '444444');
      expect(result).toBe(true);

      // The socket's attempt counter should be deleted (internal state)
      expect((portal as any).otpAttempts.has(socket)).toBe(false);
    });

    it('should reset per-socket attempts and global counter when generateOTP is called', () => {
      portal.setOTP('111111');
      const socket = createMockSocket();

      // Accumulate some failures
      for (let i = 0; i < 3; i++) {
        portal.verifyOTP(socket as any, '000000');
      }

      // Generate new OTP resets everything
      const newOtp = portal.generateOTP();
      expect(newOtp).toMatch(/^\d{6}$/);
      expect((portal as any).otpAttempts.size).toBe(0);
      expect((portal as any).otpGlobalAttempts).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Edge Cases
  // ---------------------------------------------------------------------------
  describe('Edge Cases', () => {
    it('should reject verification when no OTP has been set (empty otpCode)', () => {
      const socket = createMockSocket();
      // Default otpCode is '' before any generateOTP/setOTP call
      const result = portal.verifyOTP(socket as any, '123456');
      expect(result).toBe(false);
    });

    it('should reject wrong OTP code', () => {
      portal.setOTP('123456');
      const socket = createMockSocket();
      const result = portal.verifyOTP(socket as any, '654321');
      expect(result).toBe(false);
      expect(portal.isClientAuthenticated(socket as any)).toBe(false);
    });

    it('generateOTP should produce a 6-digit numeric string', () => {
      const otp = portal.generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
      expect(otp.length).toBe(6);
    });
  });
});
