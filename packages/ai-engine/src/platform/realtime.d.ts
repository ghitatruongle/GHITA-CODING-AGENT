import { EventEmitter } from 'events';
export declare class RealtimeProxy extends EventEmitter {
    private apiKey;
    private wsServer;
    private activeConnections;
    constructor(options?: {
        apiKey?: string;
    });
    /**
     * Khởi chạy WebSocket Proxy Server
     */
    start(port?: number): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=realtime.d.ts.map