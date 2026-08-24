import { EventEmitter } from 'events';

export class RealtimeProxy extends EventEmitter {
  private apiKey: string;
  private wsServer: {
    close: (cb: () => void) => void;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
  } | null = null;
  private activeConnections = new Set<{
    close: () => void;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    readyState: number;
    send: (data: string | Buffer) => void;
  }>();

  constructor(options?: { apiKey?: string }) {
    super();
    this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
  }

  async start(port = 8081): Promise<void> {
    try {
      const { WebSocketServer } = await import('ws');
      this.wsServer = new WebSocketServer({ port });

      this.wsServer.on('connection', (socketArg: unknown) => {
        const socket = socketArg as {
          close: () => void;
          on: (event: string, handler: (...args: unknown[]) => void) => void;
          readyState: number;
          send: (data: string | Buffer) => void;
        };
        this.activeConnections.add(socket);
        this.emit('connection', socket);

        const openAIUrl =
          'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
        const headers = {
          Authorization: `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        };

        import('ws')
          .then(({ default: WebSocket }) => {
            const openAISocket = new WebSocket(openAIUrl, { headers });

            socket.on('message', (messageArg: unknown) => {
              const message = messageArg as string;
              if (openAISocket.readyState === WebSocket.OPEN) {
                openAISocket.send(message);
              }
            });

            openAISocket.on('message', (data: Buffer) => {
              if (socket.readyState === 1) {
                // OPEN
                socket.send(data.toString());
              }
            });

            openAISocket.on('error', (err: Error) => {
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
          })
          .catch((err) => {
            this.activeConnections.delete(socket);
            socket.send(
              JSON.stringify({ error: `Failed to initialize relay client: ${  err.message}` }),
            );
            socket.close();
          });
      });
    } catch (e) {
      this.wsServer = {
        close: (cb: () => void) => cb && cb(),
        on: (_event: string, _handler: (...args: unknown[]) => void) => {},
      };
      this.emit('error', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async stop(): Promise<void> {
    for (const conn of this.activeConnections) {
      try {
        conn.close();
      } catch {}
    }
    this.activeConnections.clear();

    if (this.wsServer != null) {
      const server = this.wsServer;
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  }
}
