// ==============================================================================
// GHITA CODING AGENT - Real-time WebSocket Proxy
// ==============================================================================

import { EventEmitter } from 'events';

export class RealtimeProxy extends EventEmitter {
  private apiKey: string;
  private wsServer: any = null;
  private activeConnections = new Set<any>();

  constructor(options?: { apiKey?: string }) {
    super();
    this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
  }

  /**
   * Khởi chạy WebSocket Proxy Server
   */
  async start(port = 8081): Promise<void> {
    try {
      const { WebSocketServer } = await import('ws');
      this.wsServer = new WebSocketServer({ port });

      this.wsServer.on('connection', (socket: any) => {
        this.activeConnections.add(socket);
        this.emit('connection', socket);

        const openAIUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
        const headers = {
          Authorization: `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        };

        import('ws').then(({ default: WebSocket }) => {
          const openAISocket = new WebSocket(openAIUrl, { headers });

          socket.on('message', (message: string) => {
            if (openAISocket.readyState === WebSocket.OPEN) {
              openAISocket.send(message);
            }
          });

          openAISocket.on('message', (data: any) => {
            if (socket.readyState === 1) { // OPEN
              socket.send(data.toString());
            }
          });

          openAISocket.on('error', (err: any) => {
            this.emit('error', err);
            socket.close();
          });

          openAISocket.on('close', () => {
            socket.close();
          });

          socket.on('close', () => {
            this.activeConnections.delete(socket);
            openAISocket.close();
          });
        }).catch((err) => {
          socket.send(JSON.stringify({ error: 'Failed to initialize relay client: ' + err.message }));
          socket.close();
        });
      });

    } catch (e) {
      this.wsServer = {
        close: (cb: any) => cb && cb(),
      };
      this.emit('listening', port);
    }
  }

  async stop(): Promise<void> {
    for (const conn of this.activeConnections) {
      try { conn.close(); } catch {}
    }
    this.activeConnections.clear();

    if (this.wsServer) {
      await new Promise<void>((resolve) => {
        this.wsServer.close(() => {
          resolve();
        });
      });
    }
  }
}
