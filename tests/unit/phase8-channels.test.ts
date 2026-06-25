// ==============================================================================
// GHITA CODING AGENT - Phase 8 Channel Plugins & FIFO Lanes Tests
// ==============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  defineChannelEntry,
  ChannelPluginRegistry,
  FifoQueue,
  FifoLaneManager,
  CommunicationServer,
} from '../../packages/communication/src/index.js';

describe('8: Channel Plugins & FIFO Lanes (Phase 8)', () => {
  describe('1. defineChannelEntry & Registry', () => {
    it('should define and register a channel plugin entry correctly', () => {
      const mockAdapter = {
        id: 'mock-adapter-id',
        sendMessage: vi.fn().mockResolvedValue(true),
        onMessage: vi.fn(),
      };

      const myChannel = defineChannelEntry({
        id: 'custom-channel-id',
        configSchema: {
          type: 'object',
          properties: {
            token: { type: 'string' },
          },
        },
        adapters: {
          telegram: mockAdapter,
        },
      });

      expect(myChannel.id).toBe('custom-channel-id');
      expect(myChannel.adapters.telegram).toBe(mockAdapter);

      const registry = new ChannelPluginRegistry();
      registry.registerChannel(myChannel);

      expect(registry.getChannel('custom-channel-id')).toBe(myChannel);
      expect(registry.listChannels()).toContain(myChannel);

      registry.unregisterChannel('custom-channel-id');
      expect(registry.getChannel('custom-channel-id')).toBeUndefined();
    });
  });

  describe('2. Per-session FIFO Lanes', () => {
    it('should process asynchronous events sequentially', async () => {
      const queue = new FifoQueue();
      const executionOrder: number[] = [];

      const task1 = () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            executionOrder.push(1);
            resolve();
          }, 50);
        });

      const task2 = () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            executionOrder.push(2);
            resolve();
          }, 10);
        });

      // Enqueue both. Task 2 finishes faster in setTimeout, but must be processed AFTER task 1.
      await Promise.all([queue.enqueue(task1), queue.enqueue(task2)]);

      expect(executionOrder).toEqual([1, 2]);
    });

    it('should manage multiple FIFO lanes by session ID', async () => {
      const laneManager = new FifoLaneManager();

      const laneA = laneManager.getLane('session-A');
      const laneB = laneManager.getLane('session-B');

      expect(laneA).toBeInstanceOf(FifoQueue);
      expect(laneB).toBeInstanceOf(FifoQueue);
      expect(laneA).not.toBe(laneB);

      expect(laneManager.getLane('session-A')).toBe(laneA);

      expect(laneManager.clearLane('session-A')).toBe(true);
    });
  });

  describe('3. Tauri HTTP Server Mount Channels Webhook Router', () => {
    it('should mount channel webhook and route request body correctly', async () => {
      const server = new CommunicationServer({ port: 8299 });

      const webhookPayload = { event: 'message', text: 'hello' };
      const receivedReq: any[] = [];

      const mockAdapter = {
        id: 'test-adapter',
        sendMessage: vi.fn().mockResolvedValue(true),
        onMessage: vi.fn(),
        handleWebhook: (req: any, res: any) => {
          receivedReq.push(req.body);
          res.status(200).json({ status: 'received' });
        },
      };

      const testChannel = defineChannelEntry({
        id: 'test-channel',
        configSchema: {},
        adapters: {
          test: mockAdapter,
        },
      });

      server.channelRegistry.registerChannel(testChannel);

      // Start server
      await server.start();

      // Send a mock request to the webhook endpoint
      try {
        const response = await fetch(
          'http://127.0.0.1:8299/channels/test-channel/adapters/test/webhook',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload),
          },
        );

        expect(response.status).toBe(200);
        const resBody = await response.json();
        expect(resBody).toEqual({ status: 'received' });
        expect(receivedReq[0]).toEqual(webhookPayload);
      } finally {
        await server.stop();
      }
    });

    it('should return 404 for non-existent adapters or channels', async () => {
      const server = new CommunicationServer({ port: 8298 });
      await server.start();

      try {
        const response = await fetch(
          'http://127.0.0.1:8298/channels/nonexistent/adapters/nonexistent/webhook',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );

        expect(response.status).toBe(404);
      } finally {
        await server.stop();
      }
    });
  });
});
