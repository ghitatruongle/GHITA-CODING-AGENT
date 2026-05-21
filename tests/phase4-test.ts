// ==============================================================================
// GHITA CODING AGENT - Phase 4 Integration/Unit Tests
// ==============================================================================

import { describe, it, expect, vi } from 'vitest';
import { AgentManager, SubagentSpawner, CronScheduler, createDefaultAgentManager } from '../packages/agents/src/index.js';
import { GatewayManager } from '../packages/communication/src/index.js';
import { GhitAgentClient } from '../packages/agents/src/index.js';

describe('Phase 4: Advanced Agent Capabilities', () => {
  
  describe('1. Subagent Delegation', () => {
    it('should spawn subagents sequentially', async () => {
      const manager = createDefaultAgentManager();
      const spawner = new SubagentSpawner(manager);

      const sequenceResults = await spawner.spawnSequence([
        {
          name: "Sub Coder",
          role: "coder",
          description: "Isolated coder child",
          task: "Write standard algorithms",
          skills: ["file.read", "file.write"],
        },
        {
          name: "Sub Reviewer",
          role: "reviewer",
          description: "Isolated reviewer child",
          task: "Perform detailed code review",
          skills: ["file.read"],
        }
      ]);

      expect(sequenceResults).toHaveLength(2);
      expect(sequenceResults[0].status).toBe('completed');
      expect(sequenceResults[1].status).toBe('completed');
      expect(sequenceResults[0].result).toContain('accepted task');
      expect(sequenceResults[1].result).toContain('accepted task');
    });

    it('should spawn subagents in parallel', async () => {
      const manager = createDefaultAgentManager();
      const spawner = new SubagentSpawner(manager);

      const parallelResults = await spawner.spawnParallel([
        {
          name: "Parallel Browser",
          role: "executor",
          description: "Parallel browser test",
          task: "Open browser and check stats",
        },
        {
          name: "Parallel Desktop",
          role: "executor",
          description: "Parallel desktop test",
          task: "Click visual coordinates",
        }
      ]);

      expect(parallelResults).toHaveLength(2);
      expect(parallelResults[0].status).toBe('completed');
      expect(parallelResults[1].status).toBe('completed');
    });
  });

  describe('2. Cron & Natural Language Scheduler', () => {
    it('should configure and trigger tasks based on intervals', async () => {
      const manager = createDefaultAgentManager();
      const scheduler = new CronScheduler(manager);

      const task = scheduler.addTask({
        id: "nl_interval_task",
        expression: "every 1 second",
        taskDescription: "Daily review job",
        maxIterations: 2,
      });

      expect(task.config.id).toBe('nl_interval_task');
      expect(task.status).toBe('active');

      // Wait 2.5 seconds to let execution run
      await new Promise(resolve => setTimeout(resolve, 2500));

      const updatedTask = scheduler.getTask("nl_interval_task")!;
      expect(updatedTask.runCount).toBeGreaterThanOrEqual(2);
      expect(updatedTask.status).toBe('completed');

      scheduler.stop();
    });
  });

  describe('3. Multi-Channel Gateway', () => {
    it('should initialize and aggregate message listeners', async () => {
      const gatewayManager = new GatewayManager({
        telegramToken: "MOCK_TG_TOKEN",
        discordWebhookUrl: "MOCK_DC_WEBHOOK",
        slackToken: "MOCK_SL_TOKEN",
      });

      await gatewayManager.initialize();

      const gateways = gatewayManager.listGateways();
      expect(gateways).toHaveLength(3);
      expect(gateways.every(gw => gw.isMock)).toBe(true);

      const messageCallback = vi.fn();
      gatewayManager.onMessage(messageCallback);

      const tg = gatewayManager.getGateway("telegram");
      tg.simulateMessage("/run cleanup", "tg_chat_88", "112233", "user_tester");

      expect(messageCallback).toHaveBeenCalledTimes(1);
      expect(messageCallback.mock.calls[0][0]).toMatchObject({
        gatewayType: 'telegram',
        channelId: 'tg_chat_88',
        userId: '112233',
        username: 'user_tester',
        text: '/run cleanup',
      });

      const tgSent = await gatewayManager.sendMessage("telegram", "tg_chat_88", "GHITA response");
      const dcSent = await gatewayManager.sendMessage("discord", "discord_chan_1", "GHITA notification");
      expect(tgSent).toBe(true);
      expect(dcSent).toBe(true);

      await gatewayManager.stop();
    });
  });

  describe('4. Agent SDK v2 & Ralph Loop Client Check', () => {
    it('should create SDK client and list subagents', async () => {
      const sdk = new GhitAgentClient({ serverUrl: "http://localhost:8080" });
      expect(sdk['config'].serverUrl).toBe('http://localhost:8080');

      const subs = await sdk.getSubagents();
      expect(subs).toBeInstanceOf(Array);
      expect(subs).toHaveLength(0);
    });
  });
});
