import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DiscordGateway } from '../src/gateway/discord.js';
import { SlackGateway } from '../src/gateway/slack.js';

describe('SlackGateway Events API', () => {
  const signingSecret = 'test-signing-secret';

  function sign(rawBody: string, timestamp: string): string {
    return `v0=${createHmac('sha256', signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;
  }

  it('accepts a current, correctly signed message event', async () => {
    const gateway = new SlackGateway({
      botToken: 'MOCK_TOKEN',
      signingSecret,
    });
    const handler = vi.fn();
    gateway.onMessage(handler);

    const rawBody = JSON.stringify({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C123',
        user: 'U456',
        text: 'hello from Slack',
        ts: '1710000000.125',
        client_msg_id: 'message-1',
      },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    await expect(
      gateway.ingestSignedEvent(rawBody, sign(rawBody, timestamp), timestamp),
    ).resolves.toEqual({ accepted: true });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'message-1',
        gatewayType: 'slack',
        channelId: 'C123',
        userId: 'U456',
        text: 'hello from Slack',
      }),
    );
  });

  it('rejects an invalid signature and a stale request', async () => {
    const gateway = new SlackGateway({
      botToken: 'MOCK_TOKEN',
      signingSecret,
    });
    const rawBody = JSON.stringify({ type: 'url_verification', challenge: 'challenge' });
    const currentTimestamp = Math.floor(Date.now() / 1000).toString();
    const staleTimestamp = Math.floor(Date.now() / 1000 - 301).toString();

    await expect(
      gateway.ingestSignedEvent(rawBody, 'v0=invalid', currentTimestamp),
    ).resolves.toEqual({ accepted: false });
    await expect(
      gateway.ingestSignedEvent(rawBody, sign(rawBody, staleTimestamp), staleTimestamp),
    ).resolves.toEqual({ accepted: false });
  });

  it('returns a signed URL-verification challenge', async () => {
    const gateway = new SlackGateway({
      botToken: 'MOCK_TOKEN',
      signingSecret,
    });
    const rawBody = JSON.stringify({ type: 'url_verification', challenge: 'challenge' });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    await expect(
      gateway.ingestSignedEvent(rawBody, sign(rawBody, timestamp), timestamp),
    ).resolves.toEqual({ accepted: true, challenge: 'challenge' });
  });
});

describe('SlackGateway delivery semantics', () => {
  const signingSecret = 'test-signing-secret';

  it('dispatches a retried message event only once', async () => {
    const gateway = new SlackGateway({
      botToken: 'MOCK_TOKEN',
      signingSecret,
    });
    const handler = vi.fn();
    gateway.onMessage(handler);

    const rawBody = JSON.stringify({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C123',
        user: 'U456',
        text: 'deliver once',
        ts: '1710000000.125',
        client_msg_id: 'duplicate-message',
      },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `v0=${createHmac('sha256', signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;

    await gateway.ingestSignedEvent(rawBody, signature, timestamp);
    await gateway.ingestSignedEvent(rawBody, signature, timestamp);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('DiscordGateway lifecycle', () => {
  it('deduplicates repeated MESSAGE_CREATE payloads', async () => {
    const gateway = new DiscordGateway({ token: 'MOCK_TOKEN' });
    const handler = vi.fn();
    gateway.onMessage(handler);
    const internals = gateway as unknown as {
      handleGatewayPayload(raw: Buffer): void;
    };
    const payload = Buffer.from(
      JSON.stringify({
        op: 0,
        t: 'MESSAGE_CREATE',
        s: 12,
        d: {
          id: 'discord-message-1',
          channel_id: 'discord-channel-1',
          content: 'deliver once',
          timestamp: '2026-07-28T00:00:00.000Z',
          author: { id: 'discord-user-1', username: 'user', bot: false },
        },
      }),
    );

    internals.handleGatewayPayload(payload);
    internals.handleGatewayPayload(payload);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  });

  it('schedules reconnect with exponential backoff after a disconnect', async () => {
    vi.useFakeTimers();
    try {
      const gateway = new DiscordGateway({ token: 'MOCK_TOKEN' });
      const internals = gateway as unknown as {
        stopped: boolean;
        gatewayUrl: string;
        reconnectAttempts: number;
        connect(): Promise<boolean>;
        scheduleReconnect(): void;
      };
      internals.stopped = false;
      internals.gatewayUrl = 'wss://gateway.example.test';
      const connect = vi.spyOn(internals, 'connect').mockResolvedValue(true);

      internals.scheduleReconnect();
      expect(internals.reconnectAttempts).toBe(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(connect).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(connect).toHaveBeenCalledTimes(1);

      internals.scheduleReconnect();
      expect(internals.reconnectAttempts).toBe(2);
      await vi.advanceTimersByTimeAsync(1999);
      expect(connect).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
