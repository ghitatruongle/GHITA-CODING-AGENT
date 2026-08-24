import { randomUUID } from 'node:crypto';
import type { PaymentIntent, PaymentProvider, PaymentStatus } from './types.js';

/**
 * Provider-agnostic payment abstraction — SIMULATION ONLY.
 * No money ever moves: capture/refund mutate an in-memory ledger. A real
 * implementation must call Stripe/PayPal/etc and be audited before shipping.
 */
export class PaymentGateway {
  /** Always true for this implementation — callers can assert against it. */
  readonly simulated = true as const;

  private intents = new Map<string, PaymentIntent>();
  private provider: PaymentProvider;
  private readonly apiKey: string;

  constructor(opts: { provider: PaymentProvider; apiKey: string }) {
    this.provider = opts.provider;
    this.apiKey = opts.apiKey;
    if (typeof console !== 'undefined') {
      console.warn(
        '[marketplace] PaymentGateway is SIMULATED: intents never reach a real ' +
          'payment provider and no funds move. Do not use for real revenue.',
      );
    }
  }

  /**
   * Create a payment intent (does NOT charge yet).
   */
  createIntent(params: {
    amount: number;
    currency: { code: string; symbol: string; decimals: number };
    buyerId: string;
    productId: string;
  }): PaymentIntent {
    const intent: PaymentIntent = {
      id: `pi_${randomUUID()}`,
      provider: this.provider,
      amount: params.amount,
      currency: params.currency,
      buyerId: params.buyerId,
      productId: params.productId,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.intents.set(intent.id, intent);
    return intent;
  }

  /**
   * Authorize (hold) a payment.
   */
  authorize(intentId: string): PaymentIntent {
    return this.transition(intentId, 'authorized');
  }

  /**
   * Capture an authorized payment.
   */
  capture(intentId: string): PaymentIntent {
    return this.transition(intentId, 'captured');
  }

  /**
   * Refund a captured payment (full or partial).
   */
  refund(intentId: string, amount?: number): PaymentIntent {
    const intent = this.getOrThrow(intentId);
    if (intent.status !== 'captured') {
      throw new Error(`Cannot refund intent in status ${intent.status}`);
    }
    if (amount !== undefined && amount > intent.amount) {
      throw new Error('Refund amount exceeds captured amount');
    }
    intent.status = 'refunded';
    intent.completedAt = Date.now();
    return intent;
  }

  /**
   * Mark a payment as failed.
   */
  fail(intentId: string, reason: string): PaymentIntent {
    const intent = this.transition(intentId, 'failed');
    (intent as PaymentIntent & { failureReason?: string }).failureReason = reason;
    return intent;
  }

  /**
   * Get intent by ID.
   */
  get(intentId: string): PaymentIntent | undefined {
    return this.intents.get(intentId);
  }

  /**
   * List intents for a buyer.
   */
  listForBuyer(buyerId: string): PaymentIntent[] {
    return Array.from(this.intents.values()).filter((i) => i.buyerId === buyerId);
  }

  private transition(id: string, to: PaymentStatus): PaymentIntent {
    const intent = this.getOrThrow(id);
    intent.status = to;
    if (to === 'captured' || to === 'refunded' || to === 'failed' || to === 'cancelled') {
      intent.completedAt = Date.now();
    }
    return intent;
  }

  private getOrThrow(id: string): PaymentIntent {
    const i = this.intents.get(id);
    if (!i) throw new Error(`Payment intent not found: ${id}`);
    return i;
  }

  /** Return the configured provider */
  get providerName(): PaymentProvider {
    return this.provider;
  }

  /** Mask the API key for logging */
  get maskedKey(): string {
    if (this.apiKey.length < 8) return '***';
    return `${this.apiKey.slice(0, 4)}***${this.apiKey.slice(-4)}`;
  }
}
