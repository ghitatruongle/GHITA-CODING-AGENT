import { describe, it, expect, vi } from 'vitest';
import {
  isSafeUrl,
  safeFetch,
  getSessionKey,
  FifoLaneManager,
  TelegramAdapter,
  DiscordAdapter,
  WhatsAppAdapter,
  IMessageAdapter,
  SlackAdapter,
} from '../../packages/communication/src/index.js';

describe('Omnichannel Gateway Security & Session Keys', () => {
  it('should block local/private IPs in SSRF filter', async () => {
    expect(await isSafeUrl('http://127.0.0.1')).toBe(false);
    expect(await isSafeUrl('https://127.0.0.1:8080/path')).toBe(false);
    expect(await isSafeUrl('http://localhost')).toBe(false);
    expect(await isSafeUrl('http://10.1.2.3/webhook')).toBe(false);
    expect(await isSafeUrl('https://192.168.1.1/test')).toBe(false);
    expect(await isSafeUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(await isSafeUrl('http://[::1]')).toBe(false);
  });

  it('should allow public domains in SSRF filter', async () => {
    // google.com should resolve to a public IP and be safe
    expect(await isSafeUrl('https://google.com')).toBe(true);
  });

  it('should throw on unsafe fetch calls', async () => {
    await expect(safeFetch('http://127.0.0.1/admin')).rejects.toThrow('SSRF blocked request');
  });

  it('should generate correct cross-channel session keys', () => {
    expect(getSessionKey('telegram', '987654321')).toBe('telegram:987654321');
    expect(getSessionKey('discord', 'channel_456')).toBe('discord:channel_456');
    expect(getSessionKey('slack', 'C12345')).toBe('slack:C12345');
  });
});

describe('FIFO Lanes & Serialization', () => {
  it('should execute tasks in order sequentially per session', async () => {
    const laneManager = new FifoLaneManager();
    const sessionKey = getSessionKey('telegram', 'user_session_9');
    const queue = laneManager.getLane(sessionKey);

    const executionOrder: number[] = [];

    const task1 = () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          executionOrder.push(1);
          resolve();
        }, 100);
      });

    const task2 = () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          executionOrder.push(2);
          resolve();
        }, 10);
      });

    const task3 = () =>
      new Promise<void>((resolve) => {
        executionOrder.push(3);
        resolve();
      });

    // Enqueue concurrently
    const p1 = queue.enqueue(task1);
    const p2 = queue.enqueue(task2);
    const p3 = queue.enqueue(task3);

    await Promise.all([p1, p2, p3]);

    // Although task1 has 100ms and task2 has 10ms, FIFO lane must process them strictly in order: 1 -> 2 -> 3
    expect(executionOrder).toEqual([1, 2, 3]);
  });
});

describe('Telegram Channel Adapter', () => {
  it('should correctly split messages longer than 4096 characters', async () => {
    const adapter = new TelegramAdapter('MOCK_TELEGRAM_TOKEN');
    const longText = 'A'.repeat(5000);
    const sendSpy = vi
      .spyOn(
        adapter as unknown as {
          sendHttpRequest: (channelId: string, text: string) => Promise<boolean>;
        },
        'sendHttpRequest',
      )
      .mockResolvedValue(true);

    const success = await adapter.sendMessage('chat123', longText);

    expect(success).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const firstCallLength = sendSpy.mock.calls[0]?.[1]?.length || 0;
    const secondCallLength = sendSpy.mock.calls[1]?.[1]?.length || 0;
    expect(firstCallLength).toBeLessThanOrEqual(4096);
    expect(firstCallLength + secondCallLength).toBe(5000);
  });

  it('should respect rate-throttling on send', async () => {
    // Set low throttle window for test speed (50ms)
    const adapter = new TelegramAdapter('MOCK_TELEGRAM_TOKEN', { throttleMs: 50 });
    const sendSpy = vi
      .spyOn(
        adapter as unknown as {
          sendHttpRequest: (channelId: string, text: string) => Promise<boolean>;
        },
        'sendHttpRequest',
      )
      .mockResolvedValue(true);

    const start = Date.now();
    const p1 = adapter.sendMessage('chat123', 'msg1');
    const p2 = adapter.sendMessage('chat123', 'msg2');
    await Promise.all([p1, p2]);

    const duration = Date.now() - start;
    // Sending two messages with 50ms throttle should take at least 50ms total
    expect(duration).toBeGreaterThanOrEqual(45);
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  it('should poll and route incoming messages correctly', async () => {
    const adapter = new TelegramAdapter('MOCK_TELEGRAM_TOKEN');
    const received: Array<{ text: string; chat: { id: number } }> = [];
    adapter.onMessage((msg) => {
      received.push(msg as { text: string; chat: { id: number } });
    });

    adapter.simulateMessage('123456', 'hello bot');

    expect(received.length).toBe(1);
    expect(received[0].text).toBe('hello bot');
    expect(received[0].chat.id).toBe(123456);
  });
});

describe('Discord Channel Adapter', () => {
  it('should handle incoming messages and honestly reject sends without a real token', async () => {
    const adapter = new DiscordAdapter('MOCK_DISCORD_TOKEN');
    const received: Array<{ content: string; channelId: string }> = [];
    adapter.onMessage((msg) => {
      received.push(msg as { content: string; channelId: string });
    });

    // v0.8.0: a MOCK/none token must NOT report a fake successful delivery.
    const sent = await adapter.sendMessage('chan_123', 'Hello Discord');
    expect(sent).toBe(false);

    adapter.simulateMessage('chan_123', 'hello from discord');

    expect(received.length).toBe(1);
    expect(received[0].content).toBe('hello from discord');
    expect(received[0].channelId).toBe('chan_123');
  });
});

describe('WhatsApp Channel Adapter', () => {
  it('should not fake linkage and should honestly reject sends with a mock URL', async () => {
    const adapter = new WhatsAppAdapter('ws://MOCK_WHATSAPP_HOST');
    await adapter.start();

    // v0.8.0: a mock gateway must NOT report a fabricated LINKED state.
    expect(adapter.getPairingStatus()).toBe('UNLINKED');

    const received: Array<{ text: string; from: string }> = [];
    adapter.onMessage((msg) => {
      received.push(msg as { text: string; from: string });
    });

    const sent = await adapter.sendMessage('phone_number', 'Hi on WhatsApp');
    expect(sent).toBe(false);

    adapter.simulateMessage('phone_number', 'hello from whatsapp');
    expect(received.length).toBe(1);
    expect(received[0].text).toBe('hello from whatsapp');
    expect(received[0].from).toBe('phone_number');

    await adapter.stop();
  });
});

describe('iMessage Channel Adapter', () => {
  it('should honestly reject sends on non-macOS and capture incoming messages', async () => {
    const adapter = new IMessageAdapter();
    const received: Array<{ text: string; sender: string }> = [];
    adapter.onMessage((msg) => {
      received.push(msg as { text: string; sender: string });
    });

    // v0.8.0: iMessage has no transport off macOS; send must be an honest false.
    const sent = await adapter.sendMessage('+1234567890', 'Hello iMessage');
    expect(sent).toBe(false);

    adapter.simulateMessage('+1234567890', 'hi back');
    expect(received.length).toBe(1);
    expect(received[0].text).toBe('hi back');
    expect(received[0].sender).toBe('+1234567890');
  });
});

describe('Slack Channel Adapter', () => {
  it('should honestly reject sends with mock tokens and trigger callbacks on messages', async () => {
    const adapter = new SlackAdapter('MOCK_APP_TOKEN', 'MOCK_BOT_TOKEN');
    const received: Array<{ text: string; channel: string }> = [];
    adapter.onMessage((msg) => {
      received.push(msg as { text: string; channel: string });
    });

    // v0.8.0: MOCK tokens must not report a fake delivery.
    const sent = await adapter.sendMessage('C123', 'Hello Slack');
    expect(sent).toBe(false);

    adapter.simulateMessage('C123', 'hey slackbot');
    expect(received.length).toBe(1);
    expect(received[0].text).toBe('hey slackbot');
    expect(received[0].channel).toBe('C123');
  });
});

describe('Omnichannel E2E Loop Simulation', () => {
  it('should complete E2E cycle: incoming message -> execute tool -> send response', async () => {
    // Setup Telegram Adapter
    const adapter = new TelegramAdapter('MOCK_TELEGRAM_TOKEN');
    const responseSpy = vi
      .spyOn(
        adapter as unknown as {
          sendHttpRequest: (channelId: string, text: string) => Promise<boolean>;
        },
        'sendHttpRequest',
      )
      .mockResolvedValue(true);

    // Mock Tool Registry & Execution Function
    const tools = {
      calculator: (expr: string) => {
        if (expr === '2 + 2') return '4';
        return 'unknown expression';
      },
    };

    // Register adapter handler to mock agent parsing
    adapter.onMessage(async (message) => {
      const text = message.text || '';
      const chatId = message.chat.id.toString();

      // Check if text triggers a tool request
      if (text.startsWith('/calc ')) {
        const expr = text.replace('/calc ', '').trim();
        const result = tools.calculator(expr);
        // Reply back
        await adapter.sendMessage(chatId, `Result: <b>${result}</b>`);
      }
    });

    // Simulate incoming message asking to calculate
    adapter.simulateMessage('999', '/calc 2 + 2');

    // Yield macro task queue to let async handler complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Assert that the tool was executed and the Telegram sendMessage was triggered with exact response
    expect(responseSpy).toHaveBeenCalledTimes(1);
    expect(responseSpy.mock.calls[0]?.[0]).toBe('999');
    expect(responseSpy.mock.calls[0]?.[1]).toBe('Result: <b>4</b>');
  });
});
