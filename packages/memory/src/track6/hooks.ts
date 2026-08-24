// Session hooks (SessionStart, UserPrompt, PreTool, PostTool, PostCompact)
// that auto-capture activity into the memory journal with a 5-minute dedup
// window (agentmemory pattern).

import { createHash } from 'node:crypto';

export type CaptureHook =
  | 'session-start'
  | 'user-prompt'
  | 'pre-tool'
  | 'post-tool'
  | 'post-tool-failure'
  | 'pre-compact';

export interface CaptureEvent {
  hook: CaptureHook;
  /** Content being captured (bounded). */
  content: string;
  /** Optional structured payload. */
  payload?: Record<string, unknown>;
  at: number;
  sessionId: string;
}

export interface CaptureSink {
  (event: CaptureEvent): void | Promise<void>;
}

export interface DedupOptions {
  /** Dedup window in ms (default 5 minutes). */
  windowMs?: number;
}

export class MemoryCaptureHooks {
  private readonly seen = new Map<string, number>();
  private readonly windowMs: number;
  private emitted = 0;

  constructor(
    private readonly sink: CaptureSink,
    options: DedupOptions = {},
  ) {
    this.windowMs = options.windowMs ?? 300_000;
  }

  /** Emit an event unless an identical one arrived within the window. */
  async emit(
    hook: CaptureHook,
    sessionId: string,
    content: string,
    payload?: Record<string, unknown>,
  ): Promise<boolean> {
    const key = hash(`${hook}|${sessionId}|${content}`);
    const last = this.seen.get(key);
    const now = Date.now();
    if (last !== undefined && now - last < this.windowMs) {
      return false; // deduplicated
    }
    this.seen.set(key, now);
    // Prune stale keys (bounded memory).
    if (this.seen.size > 500) {
      for (const [k, t] of this.seen) {
        if (now - t > this.windowMs) this.seen.delete(k);
      }
    }
    const event: CaptureEvent = { hook, content, payload, at: now, sessionId };
    await this.sink(event);
    this.emitted += 1;
    return true;
  }

  /** Convenience: the five standard capture points. */
  async sessionStart(sessionId: string, meta: Record<string, unknown> = {}): Promise<boolean> {
    return this.emit('session-start', sessionId, `session started ${sessionId}`, meta);
  }

  async userPrompt(sessionId: string, prompt: string): Promise<boolean> {
    return this.emit('user-prompt', sessionId, prompt.slice(0, 4000));
  }

  async preTool(sessionId: string, tool: string, args: Record<string, unknown>): Promise<boolean> {
    return this.emit('pre-tool', sessionId, `tool:${tool} ${JSON.stringify(args).slice(0, 2000)}`, {
      tool,
    });
  }

  async postTool(sessionId: string, tool: string, ok: boolean, output?: string): Promise<boolean> {
    const hook: CaptureHook = ok ? 'post-tool' : 'post-tool-failure';
    return this.emit(
      hook,
      sessionId,
      `tool:${tool} ${ok ? 'ok' : 'failed'} ${(output ?? '').slice(0, 2000)}`,
      { tool, ok },
    );
  }

  async preCompact(sessionId: string, summary: string): Promise<boolean> {
    return this.emit('pre-compact', sessionId, summary.slice(0, 4000));
  }

  stats(): { emitted: number } {
    return { emitted: this.emitted };
  }
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}
