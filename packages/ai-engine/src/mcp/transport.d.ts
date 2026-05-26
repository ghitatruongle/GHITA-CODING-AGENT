import type { MCPServerConfig } from './types.js';
export interface MCPTransport {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(request: Record<string, unknown>): Promise<Record<string, unknown>>;
    isConnected(): boolean;
}
/**
 * Stdio transport — spawn process, communicate via stdin/stdout JSON-RPC
 */
export declare class StdioTransport implements MCPTransport {
    private config;
    private connected;
    private requestId;
    constructor(config: MCPServerConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(_request: Record<string, unknown>): Promise<Record<string, unknown>>;
    isConnected(): boolean;
}
/**
 * SSE transport — connect to HTTP SSE endpoint
 */
export declare class SSETransport implements MCPTransport {
    private config;
    private connected;
    private requestId;
    constructor(config: MCPServerConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(request: Record<string, unknown>): Promise<Record<string, unknown>>;
    isConnected(): boolean;
}
/** Factory tạo transport từ config */
export declare function createTransport(config: MCPServerConfig): MCPTransport;
//# sourceMappingURL=transport.d.ts.map