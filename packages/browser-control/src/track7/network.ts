// Request logging, abort allowlist (block domains), and HAR export
// (Playwright route pattern).

export type RequestMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS'
  | string;

export interface NetworkRequest {
  id: string;
  method: RequestMethod;
  url: string;
  status: number | null;
  startedAt: number;
  endedAt?: number;
  /** Request duration ms. */
  durationMs?: number;
  blocked: boolean;
  /** Bytes transferred (when known). */
  size?: number;
  resourceType?: string;
}

export interface InterceptDecision {
  /** True when the request should be aborted. */
  block: boolean;
  reason?: string;
}

export interface BlockRule {
  /** Regex pattern matched against the host. */
  hostPattern: RegExp;
  /** Reason label for the log. */
  reason: string;
}

export class NetworkInterceptor {
  private requests = new Map<string, NetworkRequest>();
  private blockRules: BlockRule[] = [];
  private order = 0;

  /** Add a block rule (host pattern, e.g. /ads|tracker/). */
  addBlockRule(hostPattern: RegExp, reason: string): void {
    this.blockRules.push({ hostPattern, reason });
  }

  /** Decide whether to block a URL before navigation/fetch. */
  decide(url: string): InterceptDecision {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return { block: false };
    }
    for (const rule of this.blockRules) {
      if (rule.hostPattern.test(host)) {
        return { block: true, reason: rule.reason };
      }
    }
    return { block: false };
  }

  /** Begin a request record. */
  start(method: RequestMethod, url: string, resourceType?: string): string {
    const id = `req_${++this.order}_${Date.now().toString(36)}`;
    this.requests.set(id, {
      id,
      method,
      url,
      status: null,
      startedAt: Date.now(),
      blocked: false,
      resourceType,
    });
    return id;
  }

  /** Finish a request record. */
  finish(id: string, status: number | null, size?: number): void {
    const req = this.requests.get(id);
    if (!req) return;
    req.status = status;
    req.endedAt = Date.now();
    req.durationMs = req.endedAt - req.startedAt;
    req.size = size;
  }

  /** Mark a request as blocked. */
  markBlocked(id: string, reason?: string): void {
    const req = this.requests.get(id);
    if (!req) return;
    req.blocked = true;
    req.endedAt = Date.now();
    req.durationMs = req.endedAt - req.startedAt;
    void reason;
  }

  list(filter?: { blocked?: boolean }): NetworkRequest[] {
    let out = [...this.requests.values()];
    if (filter?.blocked !== undefined) out = out.filter((r) => r.blocked === filter.blocked);
    return out.sort((a, b) => a.startedAt - b.startedAt);
  }

  /** Export requests as a HAR 1.2 document. */
  exportHAR(creator = 'ghita-browser-control'): string {
    const entries = this.list().map((r) => ({
      startedDateTime: new Date(r.startedAt).toISOString(),
      time: r.durationMs ?? 0,
      request: {
        method: r.method,
        url: r.url,
        httpVersion: 'HTTP/1.1',
        headers: [],
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: r.status ?? 0,
        statusText: r.status ? String(r.status) : r.blocked ? 'blocked' : 'pending',
        httpVersion: 'HTTP/1.1',
        headers: [],
        cookies: [],
        content: { size: r.size ?? 0, mimeType: '' },
        redirectURL: '',
        headersSize: -1,
        bodySize: r.size ?? -1,
      },
      cache: {},
      timings: {
        send: 0,
        wait: r.durationMs ?? 0,
        receive: 0,
      },
      _ghita: { blocked: r.blocked, resourceType: r.resourceType },
    }));

    return JSON.stringify(
      {
        log: {
          version: '1.2',
          creator: { name: creator, version: '1.1.0' },
          pages: [],
          entries,
        },
      },
      null,
      2,
    );
  }
}
