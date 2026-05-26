import { Orchestrator } from '../orchestrator.js';
export declare class GrpcServer {
    private server;
    private orchestrator;
    private sessions;
    constructor(orchestrator: Orchestrator);
    /**
     * Khởi chạy gRPC server
     */
    start(port?: number, host?: string): Promise<number>;
    /**
     * Dừng gRPC server
     */
    stop(): Promise<void>;
    /**
     * Xử lý luồng gRPC song phương (duplex stream) Chat
     */
    private handleChat;
}
//# sourceMappingURL=server.d.ts.map