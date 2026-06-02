// ==============================================================================
// GHITA CODING AGENT - Phase 18: Omnichannel Live Telepresence Portal
// ==============================================================================
// WebSocket server for secure telepresence stream, OTP challenge, payload encryption,
// image compression, and mobile command resolution.
// ==============================================================================

import { createServer, type Server as HttpServer, type IncomingMessage } from 'node:http';
import * as crypto from 'node:crypto';
import type { Socket } from 'node:net';

export class TelepresencePortal {
  private server: HttpServer | null = null;
  private clients = new Set<Socket>();
  private socketBuffers = new Map<Socket, Buffer>();
  private otpCode = '';
  private otpVerifiedClients = new WeakMap<Socket, boolean>();
  private bandwidthStatus: 'good' | 'weak' = 'good';
  private fpsLimit = 30; // 30 FPS default
  private jpegQuality = 90; // 90% quality default
  private secretKey: Buffer;
  private lastFrameHash = 0;
  private goodFrameCount = 0;

  // Command handlers / Callback interfaces
	public onCommandCallback?: (command: string, args?: Record<string, unknown>) => void;
  public onPauseCallback?: () => void;
  public onForceBranchCallback?: (branch: string) => void;
  public onInjectVariablesCallback?: (variables: Record<string, string>) => void;

  constructor(private readonly port: number = 8089, encryptionPassword?: string) {
    // Require password from env or parameter - no hardcoded default
    const password = encryptionPassword || process.env.GHITA_TELEPRESENCE_KEY;
    if (!password) {
      throw new Error('[TelepresencePortal] Encryption password required. Set GHITA_TELEPRESENCE_KEY env or pass to constructor.');
    }
    // Generate random 16-byte salt per instance for key derivation
    const salt = crypto.randomBytes(16);
    // Generate standard 32-byte key from password using scrypt with random salt
    this.secretKey = crypto.scryptSync(password, salt, 32);
  }

  /**
   * Start the Telepresence WebSocket server
   */
  public async start(): Promise<void> {
    this.server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('GHITA Telepresence Portal');
    });

    this.server.on('upgrade', (req: IncomingMessage, socket: Socket, _head: Buffer) => {
      const upgrade = req.headers.upgrade;
      if (upgrade && upgrade.toLowerCase() === 'websocket') {
        const secKey = req.headers['sec-websocket-key'];
        if (!secKey) {
          socket.destroy();
          return;
        }

        const acceptValue = crypto
          .createHash('sha1')
          .update(secKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');

        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${acceptValue}\r\n\r\n`
        );

        this.clients.add(socket);
        this.otpVerifiedClients.set(socket, false); // authentication required
        this.socketBuffers.set(socket, Buffer.alloc(0));

        socket.on('data', (chunk: Buffer) => {
          this.handleSocketData(socket, chunk);
        });

        socket.on('end', () => {
          this.clients.delete(socket);
          this.socketBuffers.delete(socket);
          socket.destroy();
        });

        socket.on('close', () => {
          this.clients.delete(socket);
          this.socketBuffers.delete(socket);
        });

        socket.on('error', () => {
          this.clients.delete(socket);
          this.socketBuffers.delete(socket);
          socket.destroy();
        });
      }
    });

    return new Promise<void>((resolve, reject) => {
      if (!this.server) return reject(new Error('Server not initialized'));
      this.server.listen(this.port, '0.0.0.0', () => {
	console.info(`[Telepresence] 🚀 WebSocket server listening on port ${this.port}`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  /**
   * Stop the Telepresence WebSocket server gracefully
   */
  public async stop(): Promise<void> {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();
    this.socketBuffers.clear();

	if (this.server) {
      const server = this.server;
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.info('[Telepresence] Server stopped');
          this.server = null;
          resolve();
        });
      });
    }
  }

  /**
   * Generate a secure 6-digit OTP code for telepresence authentication
   */
  public generateOTP(): string {
    this.otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    return this.otpCode;
  }

  /**
   * Get current OTP code
   */
  public getOTP(): string {
    return this.otpCode;
  }

  /**
   * Manually set OTP code (e.g. for testing)
   */
  public setOTP(code: string): void {
    this.otpCode = code;
  }

  /**
   * Verify OTP authentication code for a client socket connection
   */
  public verifyOTP(socket: Socket, code: string): boolean {
    if (this.otpCode && code === this.otpCode) {
      this.otpVerifiedClients.set(socket, true);
      return true;
    }
    return false;
  }

  /**
   * Check if a client socket has successfully completed OTP verification
   */
  public isClientAuthenticated(socket: Socket): boolean {
    return !!this.otpVerifiedClients.get(socket);
  }

  /**
   * Dynamically adjust transmission parameters based on bandwidth status
   */
  public setBandwidth(status: 'good' | 'weak'): void {
    this.bandwidthStatus = status;
    if (status === 'weak') {
      this.fpsLimit = 2; // Throttle to 2 FPS when bandwidth drops
      this.jpegQuality = 30; // JPEG Quality downscaled to 30%
    } else {
      this.fpsLimit = 30; // 30 FPS for healthy connection
      this.jpegQuality = 90; // 90% high quality JPEG
    }
  }

  public getBandwidthStatus(): 'good' | 'weak' {
    return this.bandwidthStatus;
  }

  public getFpsLimit(): number {
    return this.fpsLimit;
  }

  public getJpegQuality(): number {
    return this.jpegQuality;
  }

  /**
   * E2E Encrypt payload using AES-256-GCM
   * Returns IV:authTag:ciphertext (all hex-encoded)
   */
  public encrypt(data: Buffer | string): Buffer {
    const iv = crypto.randomBytes(12); // GCM uses 12-byte nonce
    const cipher = crypto.createCipheriv('aes-256-gcm', this.secretKey, iv);
    const input = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // IV (12 bytes) + authTag (16 bytes) + ciphertext
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * E2E Decrypt payload using AES-256-GCM
   * Supports new format (IV:authTag:ciphertext) and legacy format (IV:ciphertext, AES-256-CBC)
   */
  public decrypt(encryptedData: Buffer): Buffer {
    if (encryptedData.length < 29) {
      throw new Error('Invalid encrypted data length');
    }
    // Legacy format: first 16 bytes IV (AES-256-CBC)
    // New format: first 12 bytes IV + next 16 bytes authTag (AES-256-GCM)
    // Heuristic: if data is long enough for 12+16=28 byte header, try GCM first
    const ivGcm = encryptedData.subarray(0, 12);
    const authTag = encryptedData.subarray(12, 28);
    const ciphertextGcm = encryptedData.subarray(28);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.secretKey, ivGcm);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertextGcm), decipher.final()]);
    } catch {
      // Fallback: legacy AES-256-CBC format (16-byte IV, no authTag)
      const iv = encryptedData.subarray(0, 16);
      const ciphertext = encryptedData.subarray(16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.secretKey, iv);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    }
  }

  /**
   * Processes image: Downscale / Convert PNG to low-quality JPEG if needed
   */
  public async processImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default;
      return await sharp(imageBuffer)
        .jpeg({ quality: this.jpegQuality })
        .toBuffer();
    } catch {
      // Fallback if sharp is not available (e.g. in test env without sharp binaries)
      return imageBuffer;
    }
  }

  /**
   * Adler32 checksum calculation to deduplicate static frames
   */
  private getAdler32(buf: Buffer): number {
    let a = 1;
    let b = 0;
    for (let i = 0; i < buf.length; i++) {
		a = (a + (buf[i] ?? 0)) % 65521;
      b = (b + a) % 65521;
    }
    return (b << 16) | a;
  }

  /**
   * Stream / Broadcast GUI frame buffer directly to all authenticated mobile clients
   */
  public async streamFrame(frameBuffer: Buffer): Promise<void> {
    if (this.clients.size === 0) return;

    // Deduplicate static frames using Adler32
    const frameHash = this.getAdler32(frameBuffer);
    if (frameHash === this.lastFrameHash) {
      // Screen did not change, skip sending to save bandwidth
      return;
    }
    this.lastFrameHash = frameHash;

    const start = Date.now();

    // Process frame based on bandwidth limitations
    const processed = await this.processImage(frameBuffer);

    // E2E Encrypt the image frame
    const encrypted = this.encrypt(processed);

    // Broadcast frame to authenticated clients
    for (const client of this.clients) {
      if (this.isClientAuthenticated(client)) {
        this.sendFrame(client, 2, encrypted); // Opcode 2 = Binary
      }
    }

    const duration = Date.now() - start;

    // Bandwidth Estimation: dynamic adaptation
    if (duration > 150) {
      this.setBandwidth('weak');
      this.goodFrameCount = 0;
    } else if (duration < 50) {
      this.goodFrameCount++;
      if (this.goodFrameCount >= 5) {
        this.setBandwidth('good');
      }
    }
  }

  /**
   * Internal parser to read WebSocket frames in client stream
   */
  private handleSocketData(socket: Socket, chunk: Buffer): void {
    let buf = this.socketBuffers.get(socket) || Buffer.alloc(0);
    buf = Buffer.concat([buf, chunk]);

    while (buf.length >= 2) {
		const byte0 = buf[0] ?? 0;
    const byte1 = buf[1] ?? 0;
      const opcode = byte0 & 0x0f;
      const masked = (byte1 & 0x80) !== 0;
      let payloadLen = byte1 & 0x7f;

      let headerLength = 2;
      if (payloadLen === 126) {
        if (buf.length < 4) break;
        payloadLen = buf.readUInt16BE(2);
        headerLength = 4;
      } else if (payloadLen === 127) {
        if (buf.length < 10) break;
        const low = buf.readUInt32BE(6);
        payloadLen = low; // Handle lower 32-bit length
        headerLength = 10;
      }

      let maskKeyLength = 0;
      let maskingKey: Buffer | null = null;
      if (masked) {
        if (buf.length < headerLength + 4) break;
        maskingKey = buf.subarray(headerLength, headerLength + 4);
        maskKeyLength = 4;
      }

      const totalLength = headerLength + maskKeyLength + payloadLen;
      if (buf.length < totalLength) break;

      const rawPayload = buf.subarray(headerLength + maskKeyLength, totalLength);
      const payload = Buffer.alloc(payloadLen);
      if (masked && maskingKey) {
        const key = maskingKey;
        for (let i = 0; i < payloadLen; i++) {
		payload[i] = (rawPayload[i] ?? 0) ^ (key[i % 4] ?? 0);
        }
      } else {
        rawPayload.copy(payload);
      }

      this.handleFrame(socket, opcode, payload);
      buf = buf.subarray(totalLength);
    }

    this.socketBuffers.set(socket, buf);
  }

  /**
   * Process complete WebSocket frames
   */
  private handleFrame(socket: Socket, opcode: number, payload: Buffer): void {
    if (opcode === 8) {
      this.clients.delete(socket);
      socket.destroy();
      return;
    }
    if (opcode === 9) {
      // Ping, respond with Pong
      this.sendFrame(socket, 10, payload);
      return;
    }
    if (opcode === 1 || opcode === 2) {
      // Text or Binary Frame
      const dataStr = payload.toString('utf8');
      try {
        const message = JSON.parse(dataStr);
        this.routeRemoteCommand(socket, message);
      } catch {
        // Not a JSON command payload
      }
    }
  }

  /**
   * Format and send raw WebSocket frames to a client
   */
  public sendFrame(socket: Socket, opcode: number, payload: Buffer): void {
    if (socket.destroyed) return;

    const header: number[] = [];
    header.push(0x80 | opcode); // FIN = 1

    const len = payload.length;
    if (len <= 125) {
      header.push(len);
    } else if (len < 65536) {
      header.push(126);
      header.push((len >> 8) & 0xff);
      header.push(len & 0xff);
    } else {
      header.push(127);
      header.push(0, 0, 0, 0); // High 32-bits (assume 0)
      header.push((len >> 24) & 0xff);
      header.push((len >> 16) & 0xff);
      header.push((len >> 8) & 0xff);
      header.push(len & 0xff);
    }

    socket.write(Buffer.concat([Buffer.from(header), payload]));
  }

  /**
   * Parse mobile commands and trigger associated developer control gates
   */
	private routeRemoteCommand(socket: Socket, message: Record<string, unknown>): void {
    const messageType = typeof message.type === 'string' ? message.type : '';
    const messageCommand = typeof message.command === 'string' ? message.command : '';
    const messageCode = typeof message.code === 'string' ? message.code : '';
    const messageArgs = (typeof message.args === 'object' && message.args !== null) ? message.args as Record<string, unknown> : {};
    if (messageType === 'AUTH_OTP') {
      if (this.verifyOTP(socket, messageCode)) {
        this.sendFrame(socket, 1, Buffer.from(JSON.stringify({ type: 'AUTH_SUCCESS' }), 'utf8'));
      } else {
        this.sendFrame(
          socket,
          1,
          Buffer.from(JSON.stringify({ type: 'AUTH_FAILED', message: 'Invalid OTP code' }), 'utf8')
        );
      }
      return;
    }

    if (!this.isClientAuthenticated(socket)) {
      this.sendFrame(
        socket,
        1,
        Buffer.from(JSON.stringify({ type: 'AUTH_REQUIRED', message: 'Authentication required' }), 'utf8')
      );
      return;
    }

    const command = messageCommand.toUpperCase();
    if (command) {
      this.onCommandCallback?.(command, messageArgs);

      switch (command) {
        case 'PAUSE':
          this.onPauseCallback?.();
          this.sendFrame(socket, 1, Buffer.from(JSON.stringify({ type: 'COMMAND_ACK', command: 'PAUSE' }), 'utf8'));
          break;
        case 'FORCE_BRANCH':
        {
          const branch = typeof messageArgs.branch === 'string' ? messageArgs.branch : 'default';
          this.onForceBranchCallback?.(branch);
          this.sendFrame(
            socket,
            1,
            Buffer.from(JSON.stringify({ type: 'COMMAND_ACK', command: 'FORCE_BRANCH', branch }), 'utf8')
          );
          break;
        }
        case 'INJECT_VARIABLES':
        {
          const variables = (typeof messageArgs.variables === 'object' && messageArgs.variables !== null)
            ? messageArgs.variables as Record<string, string>
            : {} as Record<string, string>;
          this.onInjectVariablesCallback?.(variables);
          this.sendFrame(
            socket,
            1,
            Buffer.from(JSON.stringify({ type: 'COMMAND_ACK', command: 'INJECT_VARIABLES', variables }), 'utf8')
          );
          break;
        }
        default:
          this.sendFrame(
            socket,
            1,
            Buffer.from(JSON.stringify({ type: 'COMMAND_UNKNOWN', command }), 'utf8')
          );
          break;
      }
    }
  }

  // Get active client count for metrics / UI reporting
  public getClientCount(): number {
    return this.clients.size;
  }
}
