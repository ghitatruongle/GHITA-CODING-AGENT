import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelepresencePortal } from '../../packages/communication/src/channels/telepresencePortal.js';
import * as net from 'node:net';

describe('Phase 18: Omnichannel Live Telepresence Portal Unit Tests', () => {
  let portal: TelepresencePortal;
  let currentPort = 8200;

  beforeEach(() => {
    vi.restoreAllMocks();
    currentPort += 1;
    portal = new TelepresencePortal(currentPort, 'TEST_ENCRYPTION_PASSKEY');
  });

  afterEach(async () => {
    await portal.stop();
  });

  describe('1. E2E AES-256 Payload Encryption & Decryption', () => {
    it('should successfully encrypt and decrypt text payloads', () => {
      const originalText = 'Hello GHITA Mobile Telepresence!';
      const encrypted = portal.encrypt(originalText);

      // Verify that encryption actually changed the content (it's not plain text)
      expect(encrypted.toString('utf8')).not.toBe(originalText);
      // Encryption must prepend a 16-byte random IV, meaning size >= 17
      expect(encrypted.length).toBeGreaterThan(16);

      const decrypted = portal.decrypt(encrypted);
      expect(decrypted.toString('utf8')).toBe(originalText);
    });

    it('should successfully encrypt and decrypt raw buffer payloads', () => {
      const originalBuffer = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const encrypted = portal.encrypt(originalBuffer);

      expect(encrypted.length).toBeGreaterThan(16);

      const decrypted = portal.decrypt(encrypted);
      expect(decrypted).toEqual(originalBuffer);
    });

    it('should throw an error on attempting to decrypt invalid or small buffers', () => {
      const shortBuffer = Buffer.from([1, 2, 3]);
      expect(() => portal.decrypt(shortBuffer)).toThrow('Invalid encrypted data length');
    });
  });

  describe('2. Secure OTP Verification Challenge Gate', () => {
    it('should generate a 6-digit numeric OTP code', () => {
      const code = portal.generateOTP();
      expect(code).toBeDefined();
      expect(code.length).toBe(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it('should authenticate client successfully with matching OTP', () => {
      const code = portal.generateOTP();
      const mockSocket = {} as net.Socket;

      expect(portal.isClientAuthenticated(mockSocket)).toBe(false);

      const success = portal.verifyOTP(mockSocket, code);
      expect(success).toBe(true);
      expect(portal.isClientAuthenticated(mockSocket)).toBe(true);
    });

    it('should deny authentication with incorrect OTP', () => {
      portal.generateOTP();
      const mockSocket = {} as net.Socket;

      const success = portal.verifyOTP(mockSocket, '999999'); // Incorrect code
      expect(success).toBe(false);
      expect(portal.isClientAuthenticated(mockSocket)).toBe(false);
    });
  });

  describe('3. Dynamic Bandwidth Settings & Throttle Optimization', () => {
    it('should use default healthy connection settings (30 FPS, 90% JPEG quality)', () => {
      expect(portal.getBandwidthStatus()).toBe('good');
      expect(portal.getFpsLimit()).toBe(30);
      expect(portal.getJpegQuality()).toBe(90);
    });

    it('should throttle to 2 FPS and 30% JPEG quality on weak network detection', () => {
      portal.setBandwidth('weak');
      expect(portal.getBandwidthStatus()).toBe('weak');
      expect(portal.getFpsLimit()).toBe(2);
      expect(portal.getJpegQuality()).toBe(30);
    });

    it('should return to full speed when network recovers', () => {
      portal.setBandwidth('weak');
      portal.setBandwidth('good');
      expect(portal.getBandwidthStatus()).toBe('good');
      expect(portal.getFpsLimit()).toBe(30);
      expect(portal.getJpegQuality()).toBe(90);
    });
  });

  describe('4. WebSocket Server & Handshake', () => {
    it('should start and stop WebSocket server successfully', async () => {
      await portal.start();
      // Server should be listening, trying to start again will throw error
      await expect(portal.start()).rejects.toThrow();
      await portal.stop();
    });

    it('should handle standard websocket handshake upgrade', async () => {
      const port = currentPort;
      await portal.start();

      const client = new net.Socket();
      const handshakePromise = new Promise<string>((resolve) => {
        client.on('data', (data) => {
          resolve(data.toString('utf8'));
          client.destroy();
        });
      });

      client.connect(port, '127.0.0.1', () => {
        // Send a standard HTTP WebSocket Upgrade request
        const request =
          'GET / HTTP/1.1\r\n' +
          'Host: 127.0.0.1\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n';
        client.write(request);
      });

      const response = await handshakePromise;
      expect(response).toContain('101 Switching Protocols');
      expect(response).toContain('Upgrade: websocket');
      expect(response).toContain('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
      
      // Wait for server to process socket close event tick
      await new Promise((r) => setTimeout(r, 20));
      expect(portal.getClientCount()).toBe(0); // Socket is destroyed now
    });
  });

  describe('5. Mobile Command Resolution & Callback Gate', () => {
    it('should route PAUSE remote command with authentication', async () => {
      const port = currentPort;
      await portal.start();
      const otp = portal.generateOTP();

      const client = new net.Socket();
      let responseData = '';

      const onPauseSpy = vi.fn();
      portal.onPauseCallback = onPauseSpy;

      const completionPromise = new Promise<void>((resolve) => {
        client.on('data', (data) => {
          responseData += data.toString('utf8');
          if (responseData.includes('COMMAND_ACK')) {
            resolve();
            client.destroy();
          }
        });
      });

      client.connect(port, '127.0.0.1', () => {
        // Perform upgrade
        const request =
          'GET / HTTP/1.1\r\n' +
          'Host: 127.0.0.1\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n';
        client.write(request);

        // Once upgrade is written, send OTP Authentication Frame
        setTimeout(() => {
          const authMsg = JSON.stringify({ type: 'AUTH_OTP', code: otp });
          portal.sendFrame(client, 1, Buffer.from(authMsg, 'utf8'));
        }, 10);

        // Send PAUSE command Frame after authenticated
        setTimeout(() => {
          const pauseMsg = JSON.stringify({ command: 'PAUSE' });
          portal.sendFrame(client, 1, Buffer.from(pauseMsg, 'utf8'));
        }, 30);
      });

      await completionPromise;
      expect(onPauseSpy).toHaveBeenCalled();
    });

    it('should route FORCE_BRANCH remote command with authentication and parameters', async () => {
      const port = currentPort;
      await portal.start();
      const otp = portal.generateOTP();

      const client = new net.Socket();
      let responseData = '';

      const onForceBranchSpy = vi.fn();
      portal.onForceBranchCallback = onForceBranchSpy;

      const completionPromise = new Promise<void>((resolve) => {
        client.on('data', (data) => {
          responseData += data.toString('utf8');
          if (responseData.includes('FORCE_BRANCH')) {
            resolve();
            client.destroy();
          }
        });
      });

      client.connect(port, '127.0.0.1', () => {
        const request =
          'GET / HTTP/1.1\r\n' +
          'Host: 127.0.0.1\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n';
        client.write(request);

        setTimeout(() => {
          const authMsg = JSON.stringify({ type: 'AUTH_OTP', code: otp });
          portal.sendFrame(client, 1, Buffer.from(authMsg, 'utf8'));
        }, 10);

        setTimeout(() => {
          const forceBranchMsg = JSON.stringify({
            command: 'FORCE_BRANCH',
            args: { branch: 'experimental-feature' }
          });
          portal.sendFrame(client, 1, Buffer.from(forceBranchMsg, 'utf8'));
        }, 30);
      });

      await completionPromise;
      expect(onForceBranchSpy).toHaveBeenCalledWith('experimental-feature');
    });

    it('should route INJECT_VARIABLES remote command with environment dictionary', async () => {
      const port = currentPort;
      await portal.start();
      const otp = portal.generateOTP();

      const client = new net.Socket();
      let responseData = '';

      const onInjectVarsSpy = vi.fn();
      portal.onInjectVariablesCallback = onInjectVarsSpy;

      const completionPromise = new Promise<void>((resolve) => {
        client.on('data', (data) => {
          responseData += data.toString('utf8');
          if (responseData.includes('INJECT_VARIABLES')) {
            resolve();
            client.destroy();
          }
        });
      });

      client.connect(port, '127.0.0.1', () => {
        const request =
          'GET / HTTP/1.1\r\n' +
          'Host: 127.0.0.1\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n';
        client.write(request);

        setTimeout(() => {
          const authMsg = JSON.stringify({ type: 'AUTH_OTP', code: otp });
          portal.sendFrame(client, 1, Buffer.from(authMsg, 'utf8'));
        }, 10);

        setTimeout(() => {
          const injectMsg = JSON.stringify({
            command: 'INJECT_VARIABLES',
            args: { variables: { NODE_ENV: 'production', API_TIMEOUT: '5000' } }
          });
          portal.sendFrame(client, 1, Buffer.from(injectMsg, 'utf8'));
        }, 30);
      });

      await completionPromise;
      expect(onInjectVarsSpy).toHaveBeenCalledWith({
        NODE_ENV: 'production',
        API_TIMEOUT: '5000'
      });
    });
  });

  describe('6. Image compression fallback', () => {
    it('should processImage by returning the original image when sharp is mocked/not available', async () => {
      const buffer = Buffer.from('FAKE_PNG_BINARY');
      const processed = await portal.processImage(buffer);
      expect(processed).toEqual(buffer); // falls back gracefully in unit test env without sharp binary issues
    });
  });

  describe('7. Advanced Edge Cases & Network Fragmentation', () => {
    it('should fail decryption when using a wrong encryption passkey', () => {
      const portalA = new TelepresencePortal(9001, 'CORRECT_PASSKEY');
      const portalB = new TelepresencePortal(9002, 'WRONG_PASSKEY');

      const text = 'Super secret payload';
      const encrypted = portalA.encrypt(text);

      expect(() => portalB.decrypt(encrypted)).toThrow();
    });

    it('should parse fragmented websocket frames sent in multiple chunks', async () => {
      const port = currentPort;
      await portal.start();
      const otp = portal.generateOTP();

      const client = new net.Socket();
      let responseData = '';

      const onPauseSpy = vi.fn();
      portal.onPauseCallback = onPauseSpy;

      const completionPromise = new Promise<void>((resolve) => {
        client.on('data', (data) => {
          responseData += data.toString('utf8');
          if (responseData.includes('COMMAND_ACK')) {
            resolve();
            client.destroy();
          }
        });
      });

      client.connect(port, '127.0.0.1', () => {
        // Upgrade handshake
        const request =
          'GET / HTTP/1.1\r\n' +
          'Host: 127.0.0.1\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n';
        client.write(request);

        // Authenticate first
        setTimeout(() => {
          const authMsg = JSON.stringify({ type: 'AUTH_OTP', code: otp });
          portal.sendFrame(client, 1, Buffer.from(authMsg, 'utf8'));
        }, 10);

        // Send a fragmented frame for PAUSE command
        setTimeout(() => {
          const pauseMsg = JSON.stringify({ command: 'PAUSE' });
          
          // Generate raw frame buffer manually
          const payload = Buffer.from(pauseMsg, 'utf8');
          const header = [];
          header.push(0x81); // FIN = 1, Opcode = 1 (Text)
          
          // Client must mask payload!
          const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
          const len = payload.length;
          
          // Assume length <= 125 for PAUSE command
          header.push(0x80 | len); // MASK = 1, len
          
          const maskedPayload = Buffer.alloc(len);
          for (let i = 0; i < len; i++) {
            maskedPayload[i] = payload[i]! ^ maskKey[i % 4]!;
          }
          
          const fullFrame = Buffer.concat([Buffer.from(header), maskKey, maskedPayload]);
          
          // Split fullFrame into 3 fragmented chunks and write sequentially with small gaps!
          const chunk1 = fullFrame.subarray(0, 2);
          const chunk2 = fullFrame.subarray(2, 6);
          const chunk3 = fullFrame.subarray(6);
          
          client.write(chunk1);
          setTimeout(() => client.write(chunk2), 5);
          setTimeout(() => client.write(chunk3), 10);
        }, 30);
      });

      await completionPromise;
      expect(onPauseSpy).toHaveBeenCalled();
    });
  });
});
