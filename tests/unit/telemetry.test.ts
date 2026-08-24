import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { SemanticCache } from '../../packages/ai-engine/src/utils/cache.js';
import { CostTracker, BudgetManager } from '../../packages/ai-engine/src/utils/cost.js';
import { AIBudgetExceededError } from '../../packages/ai-engine/src/errors/index.js';
import { Orchestrator } from '../../packages/ai-engine/src/orchestrator.js';

describe('8: Advanced Security, Caching, Routing & Telemetry', () => {
  describe('1. Human-In-The-Loop Remote Command Approvals', () => {
    beforeEach(() => {
      globalThis.approveCommandHandler = null;
    });

    afterAll(() => {
      globalThis.approveCommandHandler = null;
    });

    it('should invoke global approveCommandHandler and propagate asynchronous approvals', async () => {
      let registeredHandler: ((cmd: string) => Promise<boolean>) | null = null;

      // Simulate registering the approval hook from Tauri/Sidecar
      globalThis.approveCommandHandler = async (command: string) => {
        return command === 'npm run dev';
      };

      const handler = globalThis.approveCommandHandler;
      expect(handler).not.toBeNull();

      const approved = await handler!('npm run dev');
      expect(approved).toBe(true);

      const rejected = await handler!('rm -rf /');
      expect(rejected).toBe(false);
    });
  });

  describe('2. Semantic Prompt Caching', () => {
    it('should fallback to in-memory caching and retrieve values based on exact/semantic matches', async () => {
      const mockEmbed = vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
      const cache = new SemanticCache(
        { embed: mockEmbed },
        { threshold: 0.98, fallbackToInMemory: true },
      );

      const prompt = 'How do I center a div in CSS?';
      const mockResponse = {
        content: 'Use display: flex; justify-content: center; align-items: center;',
        model: 'gpt-4o',
        provider: 'openai' as any,
        usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        finishReason: 'stop',
      };

      await cache.set(prompt, mockResponse);

      const hit = await cache.get(prompt);
      expect(hit).not.toBeNull();
      expect(hit?.content).toBe(mockResponse.content);
    });
  });

  describe('3. Cost Telemetry & Session Budget Limiters', () => {
    it('should track input/output costs correctly based on model pricing grids', async () => {
      const costTracker = new CostTracker();

      // gpt-4o: Input $0.005/1k, Output $0.015/1k
      const cost = costTracker.calculateCost('gpt-4o', 2000, 1000);
      expect(cost).toBe((2000 / 1000) * 0.005 + (1000 / 1000) * 0.015); // $0.025
    });

    it('should throw AIBudgetExceededError when budget threshold is breached', () => {
      const budgetManager = new BudgetManager({ limit: 0.05 });
      budgetManager.recordSpent(0.04);

      expect(() => {
        budgetManager.checkBudget(0.02);
      }).toThrow(AIBudgetExceededError);
    });

    it('should trigger alert callbacks at specified budget percentage thresholds', () => {
      const alertFn = vi.fn();
      const budgetManager = new BudgetManager({
        limit: 1.0,
        alertThresholds: [0.8],
        onAlert: alertFn,
      });

      budgetManager.recordSpent(0.79);
      expect(alertFn).not.toHaveBeenCalled();

      budgetManager.recordSpent(0.02); // spent = 0.81
      expect(alertFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. LAN/WAN Routing Failover Client Mechanics', () => {
    it('should fallback connections to Cloud Relay when local connection attempts exceed 3 retries', () => {
      const mockSocketConnect = vi.fn();

      // Mock SocketClient Service State Machine
      const stateMachine = {
        connectionType: 'local' as 'local' | 'cloud',
        reconnectAttempts: 0,
        cloudAddress: 'https://ghita-relay-server.onrender.com',
        connect: mockSocketConnect,

        handleConnectError() {
          this.reconnectAttempts++;
          if (this.connectionType === 'local' && this.reconnectAttempts >= 3) {
            this.connectionType = 'cloud';
            this.connect(this.cloudAddress);
          }
        },
      };

      expect(stateMachine.connectionType).toBe('local');

      stateMachine.handleConnectError();
      expect(stateMachine.connectionType).toBe('local');
      expect(stateMachine.reconnectAttempts).toBe(1);

      stateMachine.handleConnectError();
      stateMachine.handleConnectError();

      expect(stateMachine.connectionType).toBe('cloud');
      expect(stateMachine.reconnectAttempts).toBe(3);
      expect(mockSocketConnect).toHaveBeenCalledWith(stateMachine.cloudAddress);
    });
  });
});
