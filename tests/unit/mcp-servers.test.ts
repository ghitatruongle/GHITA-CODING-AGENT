import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPServersFactory } from '../../packages/ai-engine/src/mcp/servers.js';
import { StdioTransport } from '../../packages/ai-engine/src/mcp/transport.js';
import {
  ToolRepairGate,
  type RepairLLMProvider,
} from '../../packages/skills/src/registry/repair-gate.js';
import { AIToolCallRepairError } from '../../packages/ai-engine/src/errors/index.js';

describe('13: MCP Transport & Protocols', () => {
  describe('MCPServersFactory', () => {
    it('should create filesystem server config correctly', () => {
      const config = MCPServersFactory.createFilesystemServer('fs-server', ['/tmp', '/var/log']);
      expect(config.name).toBe('fs-server');
      expect(config.transport).toBe('stdio');
      expect(config.command).toBe('npx');
      expect(config.args).toContain('@modelcontextprotocol/server-filesystem');
      expect(config.args).toContain('/tmp');
      expect(config.args).toContain('/var/log');
      expect(config.enabled).toBe(true);
    });

    it('should create github server config with token in env', () => {
      const config = MCPServersFactory.createGithubServer('gh-server', 'fake-token-123');
      expect(config.transport).toBe('stdio');
      expect(config.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('fake-token-123');
    });
  });

  describe('StdioTransport (Mocked)', () => {
    it('should require a command to connect', async () => {
      const transport = new StdioTransport({
        name: 'bad-server',
        transport: 'stdio',
        enabled: true,
      });
      await expect(transport.connect()).rejects.toThrow('command is required');
    });

    // Real spawn tests are tricky in unit tests without mocking child_process,
    // so we test the state transitions.
    it('should be disconnected initially', () => {
      const transport = new StdioTransport({
        name: 'mock-server',
        command: 'echo',
        transport: 'stdio',
        enabled: true,
      });
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('ToolRepairGate', () => {
    let mockProvider: RepairLLMProvider;

    beforeEach(() => {
      mockProvider = {
        fixArguments: vi.fn(),
      };
    });

    it('should execute successfully without repair if no error occurs', async () => {
      const gate = new ToolRepairGate({ llmProvider: mockProvider, maxRetries: 3 });

      const executor = vi.fn().mockResolvedValue('success-result');

      const result = await gate.executeWithRepair(
        'test-tool',
        { type: 'object' },
        { arg1: 'value' },
        executor,
      );

      expect(result).toBe('success-result');
      expect(executor).toHaveBeenCalledTimes(1);
      expect(executor).toHaveBeenCalledWith({ arg1: 'value' });
      expect(mockProvider.fixArguments).not.toHaveBeenCalled();
    });

    it('should repair and retry if execution fails', async () => {
      const gate = new ToolRepairGate({ llmProvider: mockProvider, maxRetries: 3 });

      // Fails first time, succeeds second time
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('Validation error on arg1'))
        .mockResolvedValueOnce('success-after-repair');

      vi.mocked(mockProvider.fixArguments).mockResolvedValueOnce({ arg1: 'fixed-value' });

      const result = await gate.executeWithRepair(
        'test-tool',
        { type: 'object' },
        { arg1: 'bad-value' },
        executor,
      );

      expect(result).toBe('success-after-repair');
      expect(executor).toHaveBeenCalledTimes(2);
      expect(executor).toHaveBeenNthCalledWith(1, { arg1: 'bad-value' });
      expect(executor).toHaveBeenNthCalledWith(2, { arg1: 'fixed-value' });

      expect(mockProvider.fixArguments).toHaveBeenCalledTimes(1);
      expect(mockProvider.fixArguments).toHaveBeenCalledWith(
        'test-tool',
        { type: 'object' },
        { arg1: 'bad-value' },
        'Validation error on arg1',
      );
    });

    it('should throw AIToolCallRepairError if max retries exceeded', async () => {
      const gate = new ToolRepairGate({ llmProvider: mockProvider, maxRetries: 2 });

      const executor = vi.fn().mockRejectedValue(new Error('Persistent error'));
      vi.mocked(mockProvider.fixArguments).mockImplementation(async (name, schema, args, err) => {
        return { ...args, fixed: true };
      });

      await expect(
        gate.executeWithRepair('test-tool', {}, { attempt: 0 }, executor),
      ).rejects.toThrowError(/Failed to execute tool "test-tool" and exhausted repair attempts/);

      expect(executor).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(mockProvider.fixArguments).toHaveBeenCalledTimes(2);
    });
  });
});
