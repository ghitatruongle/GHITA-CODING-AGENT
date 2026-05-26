import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelepresencePortal } from '../src/channels/telepresencePortal.js';
import * as net from 'node:net';

vi.mock('sharp', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        jpeg: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('mocked-jpeg-buffer'))
      };
    })
  };
});

describe('Telepresence Portal Bandwidth Optimization Tests', () => {
  let portal: TelepresencePortal;
  let mockSocket: any;
  let otp: string;

  beforeEach(() => {
    portal = new TelepresencePortal(8305, 'TEST_PASSKEY');
    otp = portal.generateOTP();

    // Create a mock client socket
    mockSocket = {
      destroyed: false,
      write: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn()
    };

    // Authenticate the mock client socket
    (portal as any).clients.add(mockSocket);
    portal.verifyOTP(mockSocket, otp);
  });

  afterEach(async () => {
    await portal.stop();
    vi.restoreAllMocks();
  });

  describe('1. Adler32 Checksum Calculation', () => {
    it('should compute the correct Adler32 checksum for a buffer', () => {
      const buffer1 = Buffer.from('hello world');
      const buffer2 = Buffer.from('hello world');
      const buffer3 = Buffer.from('hello world!');

      const hash1 = (portal as any).getAdler32(buffer1);
      const hash2 = (portal as any).getAdler32(buffer2);
      const hash3 = (portal as any).getAdler32(buffer3);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toBeGreaterThan(0);
    });
  });

  describe('2. Frame Deduplication', () => {
    it('should send the frame on first write, then skip sending duplicate consecutive frames', async () => {
      const frameA = Buffer.from('frame-content-A');

      // First stream call: should transmit the frame
      await portal.streamFrame(frameA);
      expect(mockSocket.write).toHaveBeenCalledTimes(1);

      mockSocket.write.mockClear();

      // Second stream call with identical frame: should return early without calling socket.write
      await portal.streamFrame(frameA);
      expect(mockSocket.write).not.toHaveBeenCalled();

      // Third stream call with different frame: should transmit
      const frameB = Buffer.from('frame-content-B');
      await portal.streamFrame(frameB);
      expect(mockSocket.write).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. RTT-based Dynamic Quality and Frame Rate Throttling', () => {
    it('should dynamically throttle bandwidth to weak under high latency, and recover after 5 fast frames', async () => {
      // 1. Initial State should be 'good'
      expect(portal.getBandwidthStatus()).toBe('good');
      expect(portal.getFpsLimit()).toBe(30);
      expect(portal.getJpegQuality()).toBe(90);

      // Mock Date.now to simulate latency > 150ms
      // We need to return start and end values for Date.now() call sequence
      let nowCallCount = 0;
      const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        nowCallCount++;
        // First call is start time, second is end time
        if (nowCallCount === 1) return 1000;
        if (nowCallCount === 2) return 1200; // 200ms latency
        return 2000;
      });

      // Stream a unique frame
      await portal.streamFrame(Buffer.from('frame-1'));

      // Throttling should kick in
      expect(portal.getBandwidthStatus()).toBe('weak');
      expect(portal.getFpsLimit()).toBe(2);
      expect(portal.getJpegQuality()).toBe(30);

      // Restore Date.now spy to setup the recovery test
      dateNowSpy.mockRestore();

      // To recover, we need 5 consecutive frames with latency < 50ms.
      // Let's mock Date.now to return 10ms duration for each call.
      let recoveryTime = 5000;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        recoveryTime += 5; // incrementing 5ms each call ensures latency is 5ms (< 50ms)
        return recoveryTime;
      });

      // Stream 5 unique frames
      for (let i = 2; i <= 6; i++) {
        await portal.streamFrame(Buffer.from(`frame-${i}`));
      }

      // Bandwidth status should recover to 'good'
      expect(portal.getBandwidthStatus()).toBe('good');
      expect(portal.getFpsLimit()).toBe(30);
      expect(portal.getJpegQuality()).toBe(90);
    });
  });
});
