// ==============================================================================
// GHITA CODING AGENT - Agents v1.1.0 Track 5 P35: human-in-the-loop requests
// ==============================================================================
// First-class HITL: request_human_input with options/urgency/format and
// webhook resume (12-factor-agents pattern). The loop pauses until a human
// answers (or the request times out).
// ==============================================================================

export type Urgency = 'low' | 'normal' | 'high';

export interface HumanInputRequest {
  id: string;
  question: string;
  urgency: Urgency;
  /** Allowed answers (free text when omitted). */
  options?: string[];
  /** Expected answer format hint. */
  format?: 'free-text' | 'single-choice' | 'boolean';
  /** Webhook to deliver the answer asynchronously (resume). */
  webhookUrl?: string;
  state: 'pending' | 'answered' | 'cancelled' | 'timed-out';
  answer?: string;
  requestedAt: number;
  answeredAt?: number;
}

export interface RequestHumanInputManagerOptions {
  /** Max wait for an answer (ms) before the request times out (default 5 min). */
  timeoutMs?: number;
  /** Deliver the request to a human channel (UI/notification/webhook). */
  deliver?: (request: HumanInputRequest) => void | Promise<void>;
}

export class RequestHumanInputManager {
  private requests = new Map<string, HumanInputRequest>();
  private readonly timeoutMs: number;
  private readonly deliver?: (request: HumanInputRequest) => void | Promise<void>;

  constructor(options: RequestHumanInputManagerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.deliver = options.deliver;
  }

  /** Ask a human a question; returns a handle to await the answer. */
  request(input: {
    question: string;
    urgency?: Urgency;
    options?: string[];
    format?: HumanInputRequest['format'];
    webhookUrl?: string;
  }): HumanInputRequest {
    const req: HumanInputRequest = {
      id: `hitl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      question: input.question,
      urgency: input.urgency ?? 'normal',
      options: input.options,
      format: input.format ?? (input.options ? 'single-choice' : 'free-text'),
      webhookUrl: input.webhookUrl,
      state: 'pending',
      requestedAt: Date.now(),
    };
    this.requests.set(req.id, req);
    void this.deliver?.(req);

    // Auto-timeout bookkeeping.
    if (this.timeoutMs > 0) {
      setTimeout(() => {
        const current = this.requests.get(req.id);
        if (current && current.state === 'pending') {
          current.state = 'timed-out';
        }
      }, this.timeoutMs).unref?.();
    }
    return req;
  }

  /** Answer a pending request (the "resume" path, incl. webhook). */
  answer(id: string, answer: string): boolean {
    const req = this.requests.get(id);
    if (!req || req.state !== 'pending') return false;
    if (req.options && !req.options.includes(answer)) {
      // Allow close-enough matches; strict single-choice validation below.
      if (req.format === 'single-choice' && !req.options.includes(answer)) {
        return false;
      }
    }
    req.answer = answer;
    req.state = 'answered';
    req.answeredAt = Date.now();
    return true;
  }

  cancel(id: string): boolean {
    const req = this.requests.get(id);
    if (!req || req.state !== 'pending') return false;
    req.state = 'cancelled';
    return true;
  }

  /** Await the human's answer (resolves on answered/cancelled/timeout). */
  async awaitAnswer(id: string): Promise<HumanInputRequest> {
    const req = this.requests.get(id);
    if (!req) throw new Error(`unknown human-input request: ${id}`);
    if (req.state !== 'pending') return req;
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const current = this.requests.get(id);
        if (current && current.state !== 'pending') {
          clearInterval(timer);
          resolve(current);
        }
      }, 25);
    });
  }

  get(id: string): HumanInputRequest | undefined {
    return this.requests.get(id);
  }

  pending(): HumanInputRequest[] {
    return [...this.requests.values()].filter((r) => r.state === 'pending');
  }
}

/** Schema-friendly shape consumed by tool-calling layers. */
export function buildRequestHumanInputTool(manager: RequestHumanInputManager) {
  return {
    name: 'request_human_input',
    description: 'Pause the agent loop and ask the user a question (with options).',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
        options: { type: 'array', items: { type: 'string' } },
        format: { type: 'string', enum: ['free-text', 'single-choice', 'boolean'] },
        webhookUrl: { type: 'string' },
      },
      required: ['question'],
    },
    handler: async (args: Record<string, unknown>) => {
      const req = manager.request({
        question: String(args.question ?? ''),
        urgency: (args.urgency as Urgency) ?? 'normal',
        options: Array.isArray(args.options) ? args.options.map(String) : undefined,
        format: args.format as HumanInputRequest['format'],
        webhookUrl: typeof args.webhookUrl === 'string' ? args.webhookUrl : undefined,
      });
      const answered = await manager.awaitAnswer(req.id);
      return {
        content: [
          {
            type: 'text' as const,
            text:
              answered.state === 'answered'
                ? `user answered: ${answered.answer}`
                : `human input ${answered.state} (${answered.id})`,
          },
        ],
        isError: answered.state !== 'answered',
      };
    },
  };
}
