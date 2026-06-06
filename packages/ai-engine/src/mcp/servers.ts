// ==============================================================================
// GHITA CODING AGENT - MCP Custom Servers Factory
// ==============================================================================

import type { MCPServerConfig } from './types.js';

export class MCPServersFactory {
  /**
   * Tạo cấu hình cho mcp-server-filesystem (truy cập file/thư mục an toàn).
   * Yêu cầu cài đặt npx: @modelcontextprotocol/server-filesystem
   */
  static createFilesystemServer(name: string, allowedDirectories: string[]): MCPServerConfig {
    return {
      name,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', ...allowedDirectories],
      enabled: true,
    };
  }

  /**
   * Tạo cấu hình cho mcp-server-sqlite (quản lý CSDL SQLite).
   * Yêu cầu cài đặt npx: @modelcontextprotocol/server-sqlite
   */
  static createSqliteServer(name: string, dbPath: string): MCPServerConfig {
    return {
      name,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', dbPath],
      enabled: true,
    };
  }

  /**
   * Tạo cấu hình cho mcp-server-github (truy cập API Github).
   * Yêu cầu môi trường có GITHUB_PERSONAL_ACCESS_TOKEN.
   */
  static createGithubServer(name: string, token: string): MCPServerConfig {
    return {
      name,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
      enabled: true,
    };
  }

  /**
   * Tạo cấu hình cho một server HTTP SSE bất kỳ
   */
  static createSSEServer(name: string, url: string): MCPServerConfig {
    return {
      name,
      transport: 'sse',
      url,
      enabled: true,
    };
  }
}
