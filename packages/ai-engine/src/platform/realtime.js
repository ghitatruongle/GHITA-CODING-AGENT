// ==============================================================================
// GHITA CODING AGENT - Real-time WebSocket Proxy
// ==============================================================================
import { EventEmitter } from 'events';
export class RealtimeProxy extends EventEmitter {
    apiKey;
    wsServer = null;
    activeConnections = new Set();
    constructor(options) {
        super();
        this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
    }
    /**
     * Khởi chạy WebSocket Proxy Server
     */
    async start(port = 8081) {
        try {
            const { WebSocketServer } = await import('ws');
            this.wsServer = new WebSocketServer({ port });
            this.wsServer.on('connection', (socket) => {
                this.activeConnections.add(socket);
                this.emit('connection', socket);
                const openAIUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
                const headers = {
                    Authorization: `Bearer ${this.apiKey}`,
                    'OpenAI-Beta': 'realtime=v1',
                };
                import('ws').then(({ default: WebSocket }) => {
                    const openAISocket = new WebSocket(openAIUrl, { headers });
                    socket.on('message', (message) => {
                        if (openAISocket.readyState === WebSocket.OPEN) {
                            openAISocket.send(message);
                        }
                    });
                    openAISocket.on('message', (data) => {
                        if (socket.readyState === 1) { // OPEN
                            socket.send(data.toString());
                        }
                    });
                    openAISocket.on('error', (err) => {
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
        }
        catch (e) {
            this.wsServer = {
                close: (cb) => cb && cb(),
            };
            this.emit('listening', port);
        }
    }
    async stop() {
        for (const conn of this.activeConnections) {
            try {
                conn.close();
            }
            catch { }
        }
        this.activeConnections.clear();
        if (this.wsServer) {
            await new Promise((resolve) => {
                this.wsServer.close(() => {
                    resolve();
                });
            });
        }
    }
}
//# sourceMappingURL=realtime.js.map