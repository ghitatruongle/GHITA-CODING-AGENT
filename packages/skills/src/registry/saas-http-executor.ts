// v0.4.9: Real SaaS HTTP execution
//
// Performs genuine REST calls for common SaaS actions when an access token is
// available, instead of returning fabricated data. Anything without a real
// handler returns { handled: false } so the caller can fall back to the
// (explicitly flagged) simulator.

/** Minimal fetch signature so this module is testable without a network. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

export interface RealExecResult {
  /** True when a real HTTP handler ran (regardless of success). */
  handled: boolean;
  data?: unknown;
}

function str(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

async function readJson(res: {
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return { raw: await res.text().catch(() => '') };
  }
}

/**
 * Execute a real SaaS action over HTTP. Returns `{ handled: false }` when no
 * real handler exists for the app/action pair (caller should simulate).
 */
export async function executeRealSaaSAction(
  appId: string,
  action: string,
  params: Record<string, unknown>,
  accessToken: string,
  fetchImpl?: FetchLike,
): Promise<RealExecResult> {
  const fetcher = fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher || !accessToken) return { handled: false };
  const a = action.toLowerCase();
  const timeout = (): AbortSignal | undefined => AbortSignal.timeout?.(15000);

  // ── Slack ────────────────────────────────────────────────────────────────
  if (appId === 'slack' && a === 'send_message') {
    const res = await fetcher('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: str(params, 'channel') ?? '#general',
        text: str(params, 'text') ?? '',
      }),
      signal: timeout(),
    });
    const body = (await readJson(res)) as {
      ok?: boolean;
      ts?: string;
      channel?: string;
      error?: string;
    };
    return {
      handled: true,
      data: {
        channel: body.channel ?? str(params, 'channel'),
        message_id: body.ts ?? null,
        status: body.ok ? 'sent' : 'failed',
        error: body.error,
      },
    };
  }

  // ── GitHub ─────────────────────────────────────────────────────────────────
  if (appId === 'github') {
    const owner = str(params, 'owner');
    const repo = str(params, 'repo');
    const gh = (path: string, payload: Record<string, unknown>) =>
      fetcher(`https://api.github.com${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: timeout(),
      });

    if (a === 'create_issue' && owner && repo) {
      const res = await gh(`/repos/${owner}/${repo}/issues`, {
        title: str(params, 'title') ?? 'Issue',
        body: str(params, 'body') ?? '',
      });
      const body = (await readJson(res)) as { number?: number; state?: string; html_url?: string };
      return {
        handled: true,
        data: { issue_number: body.number, state: body.state, url: body.html_url },
      };
    }
    if (a === 'add_comment' && owner && repo) {
      const issue = str(params, 'issue_number') ?? str(params, 'number');
      if (!issue) return { handled: false };
      const res = await gh(`/repos/${owner}/${repo}/issues/${issue}/comments`, {
        body: str(params, 'body') ?? '',
      });
      const body = (await readJson(res)) as { id?: number; html_url?: string };
      return { handled: true, data: { comment_id: body.id, url: body.html_url } };
    }
  }

  // ── Discord (incoming webhook) ─────────────────────────────────────────────
  if (appId === 'discord' && a === 'send_message') {
    const webhook = str(params, 'webhook_url');
    if (webhook) {
      const res = await fetcher(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: str(params, 'content') ?? str(params, 'text') ?? '' }),
        signal: timeout(),
      });
      return {
        handled: true,
        data: { status: res.ok ? 'sent' : 'failed', http_status: res.status },
      };
    }
  }

  // ── Generic outgoing webhook ────────────────────────────────────────────────
  // Generic outgoing webhook. SECURITY: restricted to the dedicated `webhook`
  // app so another app's OAuth/access token is never forwarded to a
  // caller-supplied URL (prevents prompt-injection credential exfiltration).
  if (appId === 'webhook') {
    const url = str(params, 'url') ?? str(params, 'webhook_url');
    if (url) {
      const res = await fetcher(url, {
        method: str(params, 'method') ?? 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:
          typeof params['body'] === 'string'
            ? (params['body'] as string)
            : JSON.stringify(params['body'] ?? {}),
        signal: timeout(),
      });
      return {
        handled: true,
        data: {
          status: res.ok ? 'ok' : 'failed',
          http_status: res.status,
          body: await readJson(res),
        },
      };
    }
  }

  return { handled: false };
}
