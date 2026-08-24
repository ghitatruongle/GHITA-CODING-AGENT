// Wave 2b — channel plugin registry

import { describe, it, expect, vi } from 'vitest';
import { ChannelPluginRegistry, defineChannelEntry } from '../src/channel-plugin-contract.js';

describe('ChannelPluginRegistry', () => {
  it('register/get/list/unregister', () => {
    const reg = new ChannelPluginRegistry();
    const entry = defineChannelEntry({
      id: 'telegram',
      configSchema: { type: 'object' },
      adapters: {
        bot: {
          id: 'bot',
          sendMessage: async () => true,
          onMessage: () => undefined,
          healthCheck: async () => ({
            channelId: 'telegram:bot',
            connected: true,
            latencyMs: 5,
            message: 'ok',
            checkedAt: Date.now(),
          }),
        },
      },
    });
    reg.registerChannel(entry);
    expect(reg.getChannel('telegram')?.id).toBe('telegram');
    expect(reg.listChannels()).toHaveLength(1);
    expect(reg.unregisterChannel('telegram')).toBe(true);
    expect(reg.getChannel('telegram')).toBeUndefined();
  });

  it('discoverAvailable probes health and timeouts', async () => {
    vi.useFakeTimers();
    const reg = new ChannelPluginRegistry();
    reg.registerChannel(
      defineChannelEntry({
        id: 'discord',
        configSchema: {},
        adapters: {
          slow: {
            id: 'slow',
            sendMessage: async () => false,
            onMessage: () => undefined,
            healthCheck: () =>
              new Promise((resolve) => {
                setTimeout(
                  () =>
                    resolve({
                      channelId: 'discord:slow',
                      connected: true,
                      latencyMs: 1,
                      message: 'late',
                      checkedAt: Date.now(),
                    }),
                  10_000,
                );
              }),
          },
          fast: {
            id: 'fast',
            sendMessage: async () => true,
            onMessage: () => undefined,
            healthCheck: async () => ({
              channelId: 'discord:fast',
              connected: true,
              latencyMs: 2,
              message: 'ok',
              checkedAt: Date.now(),
            }),
          },
        },
      }),
    );

    const pending = reg.discoverAvailable(50);
    await vi.advanceTimersByTimeAsync(60);
    const results = await pending;
    expect(results.has('discord:fast')).toBe(true);
    expect(results.get('discord:slow')?.connected).toBe(false);
    expect(results.get('discord:slow')?.message).toMatch(/timed out/i);
    vi.useRealTimers();
  });
});
