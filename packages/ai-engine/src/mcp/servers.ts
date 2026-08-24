import type { MCPServerConfig } from './types.js';

export class MCPServersFactory {
  
  static createFilesystemServer(name: string, allowedDirectories: string[]): MCPServerConfig {
    return {
      name,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', ...allowedDirectories],
      enabled: true,
    };
  }

  static createSqliteServer(name: string, dbPath: string): MCPServerConfig {
    return {
      name,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', dbPath],
      enabled: true,
    };
  }

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

  static createSSEServer(name: string, url: string): MCPServerConfig {
    return {
      name,
      transport: 'sse',
      url,
      enabled: true,
    };
  }
}
