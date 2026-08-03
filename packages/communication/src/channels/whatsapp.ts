import type { ChannelAdapter, ChannelHealthStatus } from '../channel-plugin-contract.js';
import * as crypto from 'node:crypto';

interface WSClient {
  close(): void;
  on(event: string, cb: (data?: unknown) => void): void;
  send(data: string): void;
  readyState?: number;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly id = 'whatsapp';
  private wsUrl: string;
  private messageHandler?: (message: unknown) => void | Promise<void>;
  private isRunning = false;
  private ws: WSClient | null = null;
  private pairingStatus = 'UNLINKED';
  private retryCount = 0;
  private readonly maxRetryDelay = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(wsUrl = 'ws://localhost:9000/whatsapp') {
    this.wsUrl = wsUrl;
  }

  onMessage(handler: (message: unknown) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Send outbound message to a WhatsApp number/jid.
   */
  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (this.wsUrl.includes('MOCK_')) {
      // v0.8.0: never fake a delivery — a MOCK URL means the message was NOT sent.
      console.warn('[WhatsAppAdapter] Cannot send message: mock gateway URL.');
      return false;
    }

    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      try {
        this.ws.send(JSON.stringify({ event: 'send_message', to: channelId, text }));
        return true;
      } catch (err) {
        console.error('[WhatsAppAdapter] Failed to send message via WS:', err);
      }
    }

    // Fallback: POST request to gateway REST API
    try {
      const httpUrl = `${this.wsUrl.replace(/^ws/, 'http')}/send`;
      const response = await fetch(httpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: channelId, text }),
      });
      return response.ok;
    } catch (error) {
      console.error('[WhatsAppAdapter] HTTP send failed:', error);
      return false;
    }
  }

  /**
   * Start the connection to WhatsApp linked device gateway
   */
  async start(): Promise<void> {
    this.isRunning = true;
    if (this.wsUrl.includes('MOCK_')) {
      // v0.8.0: never report a fabricated LINKED state for a mock gateway.
      console.warn('[WhatsAppAdapter] Cannot connect: mock gateway URL. Status stays UNLINKED.');
      this.isRunning = false;
      return;
    }
    await this.connectWS();
  }

  /**
   * Stop gateway connection
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  getPairingStatus(): string {
    return this.pairingStatus;
  }

  /**
   * Trigger simulated pairing code / QR code event for testing/UI setup
   */
  simulatePairingCode(): string {
    this.pairingStatus = 'PAIRING';
    const bytes = crypto.randomBytes(4).toString('hex').toUpperCase();
    const code = bytes.substring(0, 8);
    console.info(`[WhatsAppAdapter] Link device pairing code: ${code}`);
    return code;
  }

  private async connectWS(): Promise<void> {
    if (!this.isRunning) return;

    try {
      let WebSocketCtor: new (url: string) => WSClient = (
        globalThis as unknown as { WebSocket?: new (url: string) => WSClient }
      ).WebSocket as new (url: string) => WSClient;
      if (!WebSocketCtor) {
        try {
          const wsModule = await import('ws');
          WebSocketCtor = wsModule.default as new (url: string) => WSClient;
        } catch {
          console.warn(
            '[WhatsAppAdapter] WebSocket not available in host environment. Connection skipped.',
          );
          return;
        }
      }

      const socket = new WebSocketCtor(this.wsUrl);
      this.ws = socket;

      socket.on('open', () => {
        console.info('[WhatsAppAdapter] Connected to linked-device gateway');
        this.pairingStatus = 'LINKED';
        this.retryCount = 0;
      });

      socket.on('message', async (rawData: unknown) => {
        try {
          const data = JSON.parse(String(rawData));
          if (data.event === 'message' && this.messageHandler) {
            await this.messageHandler({
              id: data.id || `wa_${Date.now()}`,
              from: data.from,
              text: data.text,
              timestamp: data.timestamp || Date.now(),
            });
          }
        } catch (err) {
          console.error('[WhatsAppAdapter] WS message parse error:', err);
        }
      });

      socket.on('close', () => {
        this.pairingStatus = 'UNLINKED';
        if (this.isRunning) {
          const delay = Math.min(1000 * Math.pow(2, this.retryCount), this.maxRetryDelay);
          this.retryCount++;
          this.reconnectTimer = setTimeout(() => this.connectWS(), delay);
        }
      });

      socket.on('error', (err: unknown) => {
        console.error('[WhatsAppAdapter] WS connection error:', err);
      });
    } catch (error) {
      console.error('[WhatsAppAdapter] WS connection setup failed:', error);
    }
  }

  /**
   * Test-only helper to simulate receiving a message
   */
  simulateMessage(from: string, text: string): void {
    if (this.messageHandler) {
      void this.messageHandler({
        id: `wa_${Date.now()}`,
        from,
        text,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Probe WhatsApp connection health by checking WS and pairing state.
   */
  async healthCheck(): Promise<ChannelHealthStatus> {
    const start = Date.now();
    const wsOpen = this.ws?.readyState === 1;
    const linked = this.pairingStatus === 'LINKED';

    return {
      channelId: this.id,
      connected: wsOpen && linked,
      latencyMs: Date.now() - start,
      message:
        wsOpen && linked
          ? 'WhatsApp linked device connected'
          : `WhatsApp ${this.pairingStatus.toLowerCase()}${wsOpen ? '' : ', WS disconnected'}`,
      checkedAt: Date.now(),
    };
  }
}
