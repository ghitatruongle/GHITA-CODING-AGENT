// ==============================================================================
// v1.1.5-beta1 Track 4.6 — Progressive Tool Disclosure Tests
// ==============================================================================

import { describe, expect, it, beforeEach } from 'vitest';
import { ToolRegistry } from './registry.js';
import type { ToolDefinition } from './registry-types.js';
import {
  shouldUseProgressiveDisclosure,
  createBridgeTools,
  resolveToolsForContext,
  estimateToolDefinitionsTokens,
} from './progressive-disclosure.js';

function makeStubTool(name: string, description = `Tool ${name}`): ToolDefinition {
  return {
    name,
    description,
    parameters: { type: 'object', properties: {} },
    tags: ['test'],
    source: 'custom',
    version: '1.0.0',
    execute: async () => `result:${name}`,
  };
}

function populateRegistry(registry: ToolRegistry, count: number): void {
  for (let i = 0; i < count; i++) {
    registry.register(
      makeStubTool(`tool_${String(i).padStart(3, '0')}`, `Description for tool ${i}`),
    );
  }
}

describe('shouldUseProgressiveDisclosure', () => {
  it('returns false when tool count is at or below threshold', () => {
    expect(shouldUseProgressiveDisclosure(60)).toBe(false);
    expect(shouldUseProgressiveDisclosure(10)).toBe(false);
    expect(shouldUseProgressiveDisclosure(0)).toBe(false);
  });

  it('returns true when tool count exceeds threshold', () => {
    expect(shouldUseProgressiveDisclosure(61)).toBe(true);
    expect(shouldUseProgressiveDisclosure(200)).toBe(true);
  });

  it('respects custom threshold', () => {
    expect(shouldUseProgressiveDisclosure(20, { threshold: 15 })).toBe(true);
    expect(shouldUseProgressiveDisclosure(10, { threshold: 15 })).toBe(false);
  });
});

describe('createBridgeTools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    populateRegistry(registry, 100);
  });

  it('creates exactly 3 bridge tools', () => {
    const bridges = createBridgeTools(registry);
    expect(bridges).toHaveLength(3);
    expect(bridges.map((b) => b.name).sort()).toEqual([
      'tool_call',
      'tool_describe',
      'tool_search',
    ]);
  });

  it('bridge tools have correct tags and source', () => {
    const bridges = createBridgeTools(registry);
    for (const b of bridges) {
      expect(b.tags).toContain('bridge');
      expect(b.source).toBe('builtin');
    }
  });

  describe('tool_search', () => {
    it('finds tools by keyword', async () => {
      const bridges = createBridgeTools(registry);
      const search = bridges.find((b) => b.name === 'tool_search')!;
      const result = JSON.parse(await search.execute({ query: 'tool_00' }));
      expect(result.count).toBeGreaterThan(0);
      expect(result.results[0].name).toContain('tool_00');
    });

    it('returns empty results for non-matching query', async () => {
      const bridges = createBridgeTools(registry);
      const search = bridges.find((b) => b.name === 'tool_search')!;
      const result = JSON.parse(await search.execute({ query: 'nonexistent_xyz' }));
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('respects limit parameter', async () => {
      const bridges = createBridgeTools(registry);
      const search = bridges.find((b) => b.name === 'tool_search')!;
      const result = JSON.parse(await search.execute({ query: 'tool_', limit: 3 }));
      expect(result.count).toBeLessThanOrEqual(3);
    });

    it('returns error when query is empty', async () => {
      const bridges = createBridgeTools(registry);
      const search = bridges.find((b) => b.name === 'tool_search')!;
      const result = JSON.parse(await search.execute({ query: '' }));
      expect(result.error).toBeDefined();
    });
  });

  describe('tool_describe', () => {
    it('returns full schema for existing tool', async () => {
      const bridges = createBridgeTools(registry);
      const describe = bridges.find((b) => b.name === 'tool_describe')!;
      const result = JSON.parse(await describe.execute({ name: 'tool_042' }));
      expect(result.name).toBe('tool_042');
      expect(result.description).toContain('Description for tool 42');
      expect(result.parameters).toBeDefined();
    });

    it('returns error for non-existent tool', async () => {
      const bridges = createBridgeTools(registry);
      const describe = bridges.find((b) => b.name === 'tool_describe')!;
      const result = JSON.parse(await describe.execute({ name: 'does_not_exist' }));
      expect(result.error).toContain('not found');
    });

    it('returns error when name is missing', async () => {
      const bridges = createBridgeTools(registry);
      const describe = bridges.find((b) => b.name === 'tool_describe')!;
      const result = JSON.parse(await describe.execute({}));
      expect(result.error).toBeDefined();
    });
  });

  describe('tool_call', () => {
    it('executes a hidden tool via bridge', async () => {
      const bridges = createBridgeTools(registry);
      const call = bridges.find((b) => b.name === 'tool_call')!;
      const result = JSON.parse(await call.execute({ name: 'tool_099', arguments: {} }));
      expect(result.ok).toBe(true);
      expect(result.output).toBe('result:tool_099');
    });

    it('returns error for non-existent tool', async () => {
      const bridges = createBridgeTools(registry);
      const call = bridges.find((b) => b.name === 'tool_call')!;
      const result = JSON.parse(await call.execute({ name: 'missing_tool', arguments: {} }));
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when name is missing', async () => {
      const bridges = createBridgeTools(registry);
      const call = bridges.find((b) => b.name === 'tool_call')!;
      const result = JSON.parse(await call.execute({ arguments: {} }));
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('resolveToolsForContext', () => {
  it('returns full definitions when below threshold', () => {
    const registry = new ToolRegistry();
    populateRegistry(registry, 30);
    const tools = resolveToolsForContext(registry);
    expect(tools.length).toBe(30);
  });

  it('returns 3 bridge tools when above threshold', () => {
    const registry = new ToolRegistry();
    populateRegistry(registry, 100);
    const tools = resolveToolsForContext(registry);
    expect(tools.length).toBe(3);
    expect(tools.map((t) => t.name).sort()).toEqual(['tool_call', 'tool_describe', 'tool_search']);
  });

  it('respects custom threshold', () => {
    const registry = new ToolRegistry();
    populateRegistry(registry, 20);
    const tools = resolveToolsForContext(registry, { threshold: 15 });
    expect(tools.length).toBe(3);
  });
});

describe('estimateToolDefinitionsTokens', () => {
  it('returns 0 for empty list', () => {
    expect(estimateToolDefinitionsTokens([])).toBe(0);
  });

  it('bridge tools cost far less than 200 raw tools', () => {
    const registry = new ToolRegistry();
    populateRegistry(registry, 200);
    const rawTokens = estimateToolDefinitionsTokens(registry.definitions());
    const bridgeTokens = estimateToolDefinitionsTokens(createBridgeTools(registry));
    // Bridge should be dramatically smaller — at least 10x reduction
    expect(bridgeTokens).toBeLessThan(rawTokens / 10);
    // And under ~1KB context budget target (~250 tokens)
    expect(bridgeTokens).toBeLessThan(300);
  });
});
