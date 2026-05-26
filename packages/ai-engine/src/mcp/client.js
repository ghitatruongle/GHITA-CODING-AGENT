// ==============================================================================
// GHITA CODING AGENT - MCP Client
// ==============================================================================
import { createTransport } from './transport.js';
export class MCPClient {
    servers = new Map();
    /** Đăng ký MCP server từ config */
    addServer(config) {
        const transport = createTransport(config);
        this.servers.set(config.name, {
            config,
            transport,
            tools: [],
            connected: false,
        });
    }
    /** Xóa MCP server */
    removeServer(name) {
        const entry = this.servers.get(name);
        if (entry) {
            void entry.transport.disconnect();
            this.servers.delete(name);
        }
    }
    /** Kết nối tới MCP server và discover tools */
    async connectServer(name) {
        const entry = this.servers.get(name);
        if (!entry)
            throw new Error(`MCP server "${name}" not found`);
        try {
            await entry.transport.connect();
            entry.connected = true;
            entry.error = undefined;
            // Discover tools via JSON-RPC
            const response = await entry.transport.send({
                method: 'tools/list',
                params: {},
            });
            const tools = (response.result?.tools ?? []);
            entry.tools = tools.map((t) => ({ ...t, serverName: name }));
            return entry.tools;
        }
        catch (error) {
            entry.connected = false;
            entry.error = error instanceof Error ? error.message : String(error);
            throw error;
        }
    }
    /** Ngắt kết nối MCP server */
    async disconnectServer(name) {
        const entry = this.servers.get(name);
        if (entry) {
            await entry.transport.disconnect();
            entry.connected = false;
            entry.tools = [];
        }
    }
    /** Gọi MCP tool */
    async callTool(serverName, toolName, args) {
        const entry = this.servers.get(serverName);
        if (!entry)
            throw new Error(`MCP server "${serverName}" not found`);
        if (!entry.connected)
            throw new Error(`MCP server "${serverName}" is not connected`);
        const response = await entry.transport.send({
            method: 'tools/call',
            params: { name: toolName, arguments: args },
        });
        const result = response.result;
        return {
            content: result?.content ?? [{ type: 'text', text: JSON.stringify(result) }],
            isError: result?.isError ?? false,
        };
    }
    /** Lấy tất cả tools từ tất cả servers */
    getAllTools() {
        const tools = [];
        for (const entry of this.servers.values()) {
            if (entry.connected) {
                tools.push(...entry.tools);
            }
        }
        return tools;
    }
    /** Lấy tool theo tên (tìm trong tất cả servers) */
    getTool(toolName) {
        for (const entry of this.servers.values()) {
            const tool = entry.tools.find((t) => t.name === toolName);
            if (tool)
                return tool;
        }
        return undefined;
    }
    /** Lấy status tất cả servers */
    getStatus() {
        const statuses = [];
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
    async connectAll() {
        const promises = [...this.servers.values()]
            .filter((e) => e.config.enabled)
            .map((e) => this.connectServer(e.config.name).catch(() => { }));
        await Promise.allSettled(promises);
    }
    /** Ngắt kết nối tất cả */
    async disconnectAll() {
        const promises = [...this.servers.values()].map((e) => this.disconnectServer(e.config.name).catch(() => { }));
        await Promise.allSettled(promises);
    }
    /** Kiểm tra server đã đăng ký chưa */
    hasServer(name) {
        return this.servers.has(name);
    }
    /** Lấy danh sách server names */
    getServerNames() {
        return [...this.servers.keys()];
    }
}
//# sourceMappingURL=client.js.map