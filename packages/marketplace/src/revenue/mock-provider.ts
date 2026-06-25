// ==============================================================================
// GHITA CODING AGENT - Mock Payment Provider (Phase 38)
// Simulates a payment gateway for testing without external dependencies
// ==============================================================================

import { randomUUID } from 'node:crypto';
import type { Currency, PaymentIntent, PaymentProvider, PaymentStatus } from './types.js';

/** Webhook event emitted by the mock provider */
export interface MockWebhookEvent {
  type: 'payment.authorized' | 'payment.captured' | 'payment.refunded' | 'payment.failed';
  intentId: string;
  timestamp: number;
  meta?: Record<string, string>;
}

export type MockWebhookListener = (event: MockWebhookEvent) => void;

const USD: Currency = { code: 'USD', symbol: '$', decimals: 2 };

/**
 * A fully in-memory mock payment provider that mirrors PaymentGateway's API
 * but adds controllable failure modes, webhook simulation, and inspection
 * helpers for testing the entire revenue pipeline end-to-end.
 */
export class MockPaymentProvider {
  readonly provider: PaymentProvider = 'stripe';
  private intents = new Map<string, PaymentIntent>();
  private listeners = new Set<MockWebhookListener>();
  private _failureRate = 0; // 0 = never fail, 1 = always fail
  private _latencyMs = 0;

  constructor(opts?: { failureRate?: number; latencyMs?: number; provider?: PaymentProvider }) {
    if (opts?.failureRate !== undefined) this._failureRate = opts.failureRate;
    if (opts?.latencyMs !== undefined) this._latencyMs = opts.latencyMs;
    if (opts?.provider) this.provider = opts.provider;
  }

  /** Subscribe to mock webhook events. Returns unsubscribe function. */
  onWebhook(listener: MockWebhookListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Set the simulated failure rate (0-1). */
  setFailureRate(rate: number): void {
    this._failureRate = Math.max(0, Math.min(1, rate));
  }

  /** Set simulated network latency in ms. */
  setLatency(ms: number): void {
    this._latencyMs = Math.max(0, ms);
  }

  /** Create a payment intent. */
  async createIntent(params: {
    amount: number;
    currency?: Currency;
    buyerId: string;
    productId: string;
  }): Promise<PaymentIntent> {
    await this.simulateLatency();

    const intent: PaymentIntent = {
      id: `pi_mock_${randomUUID()}`,
      provider: this.provider,
      amount: params.amount,
      currency: params.currency ?? USD,
      buyerId: params.buyerId,
      productId: params.productId,
      status: 'pending',
      createdAt: Date.now(),
      providerRef: `mock_ref_${randomUUID().slice(0, 8)}`,
    };
    this.intents.set(intent.id, intent);
    return intent;
  }

  /** Authorize (hold) the payment. May fail based on failureRate. */
  async authorize(intentId: string): Promise<PaymentIntent> {
    await this.simulateLatency();
    const intent = this.getOrThrow(intentId);
    if (this.shouldFail()) {
      intent.status = 'failed';
      intent.completedAt = Date.now();
      this.emit('payment.failed', intentId);
      return intent;
    }
    intent.status = 'authorized';
    this.emit('payment.authorized', intentId);
    return intent;
  }

  /** Capture an authorized payment. */
  async capture(intentId: string): Promise<PaymentIntent> {
    await this.simulateLatency();
    const intent = this.getOrThrow(intentId);
    if (intent.status !== 'authorized') {
      throw new Error(`Cannot capture intent in status ${intent.status}`);
    }
    intent.status = 'captured';
    intent.completedAt = Date.now();
    this.emit('payment.captured', intentId);
    return intent;
  }

  /** Refund a captured payment (full or partial). */
  async refund(intentId: string, amount?: number): Promise<PaymentIntent> {
    await this.simulateLatency();
    const intent = this.getOrThrow(intentId);
    if (intent.status !== 'captured') {
      throw new Error(`Cannot refund intent in status ${intent.status}`);
    }
    if (amount !== undefined && amount > intent.amount) {
      throw new Error('Refund amount exceeds captured amount');
    }
    intent.status = 'refunded';
    intent.completedAt = Date.now();
    this.emit('payment.refunded', intentId);
    return intent;
  }

  /** Get intent by ID. */
  get(intentId: string): PaymentIntent | undefined {
    return this.intents.get(intentId);
  }

  /** List all mock intents. */
  listAll(): PaymentIntent[] {
    return Array.from(this.intents.values());
  }

  /** Get count of intents by status. */
  stats(): Record<PaymentStatus, number> {
    const counts: Record<PaymentStatus, number> = {
      pending: 0,
      authorized: 0,
      captured: 0,
      refunded: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const intent of this.intents.values()) {
      counts[intent.status]++;
    }
    return counts;
  }

  /** Reset all state. */
  reset(): void {
    this.intents.clear();
    this.listeners.clear();
  }

  private getOrThrow(id: string): PaymentIntent {
    const i = this.intents.get(id);
    if (!i) throw new Error(`Mock payment intent not found: ${id}`);
    return i;
  }

  private shouldFail(): boolean {
    return Math.random() < this._failureRate;
  }

  private async simulateLatency(): Promise<void> {
    if (this._latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this._latencyMs));
    }
  }

  private emit(type: MockWebhookEvent['type'], intentId: string): void {
    const event: MockWebhookEvent = { type, intentId, timestamp: Date.now() };
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // ignore
      }
    }
  }
}
