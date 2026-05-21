// ==============================================================================
// GHITA CODING AGENT - MCP Client
// ==============================================================================

import type { MCPServerConfig, MCPTool, MCPToolResult, MCPServerStatus } from './types.js';
import { createTransport, type MCPTransport } from './transport.js';

interface MCPServerEntry {
  config: MCPServerConfig;
  transport: MCPTransport;
  tools: MCPTool[];
  connected: boolean;
  error?: string;
}

export class MCPClient {
  private servers = new Map<string, MCPServerEntry>();

  /** Đăng ký MCP server từ config */
  addServer(config: MCPServerConfig): void {
    const transport = createTransport(config);
    this.servers.set(config.name, {
      config,
      transport,
      tools: [],
      connected: false,
    });
  }

  /** Xóa MCP server */
  removeServer(name: string): void {
    const entry = this.servers.get(name);
    if (entry) {
      void entry.transport.disconnect();
      this.servers.delete(name);
    }
  }

  /** Kết nối tới MCP server và discover tools */
  async connectServer(name: string): Promise<MCPTool[]> {
    const entry = this.servers.get(name);
    if (!entry) throw new Error(`MCP server "${name}" not found`);

    try {
      await entry.transport.connect();
      entry.connected = true;
      entry.error = undefined;

      // Discover tools via JSON-RPC
      const response = await entry.transport.send({
        method: 'tools/list',
        params: {},
      });

      const tools = ((response as any).result?.tools ?? []) as MCPTool[];
      entry.tools = tools.map((t) => ({ ...t, serverName: name }));
      return entry.tools;
    } catch (error) {
      entry.connected = false;
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** Ngắt kết nối MCP server */
  async disconnectServer(name: string): Promise<void> {
    const entry = this.servers.get(name);
    if (entry) {
      await entry.transport.disconnect();
      entry.connected = false;
      entry.tools = [];
    }
  }

  /** Gọi MCP tool */
  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const entry = this.servers.get(serverName);
    if (!entry) throw new Error(`MCP server "${serverName}" not found`);
    if (!entry.connected) throw new Error(`MCP server "${serverName}" is not connected`);

    const response = await entry.transport.send({
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });

    const result = (response as any).result;
    return {
      content: result?.content ?? [{ type: 'text', text: JSON.stringify(result) }],
      isError: result?.isError ?? false,
    };
  }

  /** Lấy tất cả tools từ tất cả servers */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const entry of this.servers.values()) {
      if (entry.connected) {
        tools.push(...entry.tools);
      }
    }
    return tools;
  }

  /** Lấy tool theo tên (tìm trong tất cả servers) */
  getTool(toolName: string): MCPTool | undefined {
    for (const entry of this.servers.values()) {
      const tool = entry.tools.find((t) => t.name === toolName);
      if (tool) return tool;
    }
    return undefined;
  }

  /** Lấy status tất cả servers */
  getStatus(): MCPServerStatus[] {
    const statuses: MCPServerStatus[] = [];
    for (const entry of this.servers.values()) {
      statuses.push({
        name: entry.config.name,
        connected: entry.connected,
        tools: entry.tools,
        error: entry.error,
      });
    }
    return statuses;
  }

  /** Kết nối tất cả servers đã enabled */
  async connectAll(): Promise<void> {
    const promises = [...this.servers.values()]
      .filter((e) => e.config.enabled)
      .map((e) => this.connectServer(e.config.name).catch(() => {}));
    await Promise.allSettled(promises);
  }

  /** Ngắt kết nối tất cả */
  async disconnectAll(): Promise<void> {
    const promises = [...this.servers.values()].map((e) =>
      this.disconnectServer(e.config.name).catch(() => {}),
    );
    await Promise.allSettled(promises);
  }

  /** Kiểm tra server đã đăng ký chưa */
  hasServer(name: string): boolean {
    return this.servers.has(name);
  }

  /** Lấy danh sách server names */
  getServerNames(): string[] {
    return [...this.servers.keys()];
  }
}
