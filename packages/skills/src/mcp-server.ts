// ==============================================================================
// GHITA CODING AGENT - Skills MCP Server (standard @ghita/mcp)
// ==============================================================================

import { createMCPServer, type GhitaMCPServer, type ToolDefinition } from '@ghita/mcp';

/** Structural surface of a skill registry used by the server. */
export interface SkillLike {
  list(): Array<{ id: string; name?: string; description?: string }>;
  get(id: string): { id: string; name?: string; description?: string } | undefined;
  run(id: string, invocation?: Record<string, unknown>): Promise<unknown>;
}

export interface SkillsMCPServerConfig {
  skills: SkillLike;
  /** Deny-default: if set, only these skill ids may be executed. */
  allowList?: string[];
}

export class SkillsMCPServer {
  constructor(private readonly config: SkillsMCPServerConfig) {}

  listTools(): ToolDefinition[] {
    return [
      {
        name: 'skills.list',
        description: 'List registered skills with id and description',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const items = this.config.skills.list().map((s) => ({
            id: s.id,
            name: s.name ?? s.id,
            description: s.description ?? '',
          }));
          return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
        },
      },
      {
        name: 'skills.run',
        description: 'Execute a skill (deny-default allowlist when configured)',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            args: { type: 'object', description: 'Skill invocation arguments' },
          },
          required: ['id'],
        },
        handler: async (args) => {
          const id = String(args.id ?? '');
          const skill = this.config.skills.get(id);
          if (!skill) {
            return { content: [{ type: 'text', text: `skill not found: ${id}` }], isError: true };
          }
          const result = await this.config.skills.run(
            id,
            (args.args as Record<string, unknown>) ?? {},
          );
          return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false };
        },
      },
    ];
  }

  createServer(): GhitaMCPServer {
    return createMCPServer({
      name: 'ghita-skills',
      version: '1.1.0',
      tools: this.listTools(),
      hooks: {
        preToolCall: (name, args) => {
          if (name !== 'skills.run') return undefined;
          const allowList = this.config.allowList;
          if (allowList && allowList.length > 0 && !allowList.includes(String(args.id ?? ''))) {
            return `skill "${String(args.id)}" not in execution allowlist`;
          }
          return undefined;
        },
      },
    });
  }
}

export function createSkillsMCPServer(config: SkillsMCPServerConfig): GhitaMCPServer {
  return new SkillsMCPServer(config).createServer();
}
