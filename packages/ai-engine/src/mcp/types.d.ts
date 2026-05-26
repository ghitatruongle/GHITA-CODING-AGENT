/** Transport type cho MCP server */
export type MCPTransportType = 'stdio' | 'sse';
/** Cấu hình MCP server */
export interface MCPServerConfig {
    name: string;
    command?: string;
    args?: string[];
    url?: string;
    transport: MCPTransportType;
    env?: Record<string, string>;
    enabled: boolean;
}
/** MCP Tool definition từ server */
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    serverName: string;
}
/** Kết quả gọi MCP tool */
export interface MCPToolResult {
    content: Array<{
        type: string;
        text?: string;
        [key: string]: unknown;
    }>;
    isError?: boolean;
}
/** MCP Server status */
export interface MCPServerStatus {
    name: string;
    connected: boolean;
    tools: MCPTool[];
    error?: string;
    lastPing?: number;
}
/** Tổng hợp MCP config */
export interface MCPConfig {
    servers: MCPServerConfig[];
}
//# sourceMappingURL=types.d.ts.map