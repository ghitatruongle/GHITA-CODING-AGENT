import type { MCPServerConfig, MCPTool, MCPToolResult, MCPServerStatus } from './types.js';
export declare class MCPClient {
    private servers;
    /** Đăng ký MCP server từ config */
    addServer(config: MCPServerConfig): void;
    /** Xóa MCP server */
    removeServer(name: string): void;
    /** Kết nối tới MCP server và discover tools */
    connectServer(name: string): Promise<MCPTool[]>;
    /** Ngắt kết nối MCP server */
    disconnectServer(name: string): Promise<void>;
    /** Gọi MCP tool */
    callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
    /** Lấy tất cả tools từ tất cả servers */
    getAllTools(): MCPTool[];
    /** Lấy tool theo tên (tìm trong tất cả servers) */
    getTool(toolName: string): MCPTool | undefined;
    /** Lấy status tất cả servers */
    getStatus(): MCPServerStatus[];
    /** Kết nối tất cả servers đã enabled */
    connectAll(): Promise<void>;
    /** Ngắt kết nối tất cả */
    disconnectAll(): Promise<void>;
    /** Kiểm tra server đã đăng ký chưa */
    hasServer(name: string): boolean;
    /** Lấy danh sách server names */
    getServerNames(): string[];
}
//# sourceMappingURL=client.d.ts.map