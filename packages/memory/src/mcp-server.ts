import { createMCPServer, type GhitaMCPServer, type ToolDefinition } from '@ghita/mcp';

/** Structural surface of memory backing (AgentMemory compatible). */
export interface MemoryLike {
  remember(input: { type: string; content: string; metadata?: Record<string, unknown> }): unknown;
  search(query: string, options?: { limit?: number }): unknown[];
}

export interface MemoryMCPServerConfig {
  memory: MemoryLike;
  /** Deny-default: writes (remember) are blocked unless allowWrite is true. */
  allowWrite?: boolean;
}

export function createMemoryMCPServer(config: MemoryMCPServerConfig): GhitaMCPServer {
  const tools: ToolDefinition[] = [
    {
      name: 'memory.search',
      description: 'Search stored memories for a query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const results = config.memory.search(String(args.query ?? ''), {
          limit: typeof args.limit === 'number' ? args.limit : 10,
        });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      },
    },
    {
      name: 'memory.remember',
      description: 'Persist a memory entry (write; blocked by default)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Entry type, e.g. fact, preference, session' },
          content: { type: 'string' },
          metadata: { type: 'object' },
        },
        required: ['type', 'content'],
      },
      handler: async (args) => {
        const entry = config.memory.remember({
          type: String(args.type ?? 'fact'),
          content: String(args.content ?? ''),
          metadata: (args.metadata as Record<string, unknown> | undefined) ?? {},
        });
        return { content: [{ type: 'text', text: JSON.stringify(entry) }] };
      },
    },
  ];

  return createMCPServer({
    name: 'ghita-memory',
    version: '1.0.0',
    tools,
    hooks: {
      preToolCall: (name) =>
        name === 'memory.remember' && !config.allowWrite
          ? 'memory writes are denied by default (set allowWrite to enable)'
          : undefined,
    },
  });
}
