import type { OverageEvent, OveragePolicy } from './types.js';

export interface InvoiceLineItem {
  /** User ID */
  userId: string;
  /** Plan */
  plan: string;
  /** Overage tokens */
  overageTokens: number;
  /** Price per 1K */
  pricePer1k: number;
  /** Subtotal USD */
  subtotal: number;
  /** Timestamp */
  timestamp: number;
}

export interface OverageBillingOptions {
  /** Logger */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
  /** External billing service hook (vd: Stripe invoice) */
  onBill?: (item: InvoiceLineItem) => void | Promise<void>;
}

/**

 *

 *   const billing = new OverageBilling({ onBill: async (item) => await stripe.invoices.create(...) });
 *   const policy: OveragePolicy = { ..., onOverage: (e) => billing.handleOverage(e) };
 */
export class OverageBilling {
  private readonly invoices: InvoiceLineItem[] = [];
  private readonly onLog?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
  private readonly onBill?: (item: InvoiceLineItem) => void | Promise<void>;
  private totalBilled = 0;

  constructor(options: OverageBillingOptions = {}) {
    this.onLog = options.logger;
    this.onBill = options.onBill;
  }

  async handleOverage(event: OverageEvent): Promise<InvoiceLineItem> {
    const item: InvoiceLineItem = {
      userId: event.userId,
      plan: event.plan,
      overageTokens: event.overageTokens,
      pricePer1k: event.billingAmount > 0 ? event.billingAmount / (event.overageTokens / 1000) : 0,
      subtotal: event.billingAmount,
      timestamp: event.timestamp,
    };
    this.invoices.push(item);
    this.totalBilled += event.billingAmount;
    this.onLog?.(
      `[Billing] Invoice: user=${event.userId} overage=${event.overageTokens} cost=$${event.billingAmount.toFixed(4)}`,
      'info',
    );

    if (this.onBill) {
      try {
        await this.onBill(item);
      } catch (err) {
        this.onLog?.(`[Billing] onBill failed: ${(err as Error).message}`, 'error');
      }
    }
    return item;
  }

  defaultPolicy(pricePer1k: number, options: Partial<OveragePolicy> = {}): OveragePolicy {
    return {
      allowOverage: true,
      maxOveragePercent: options.maxOveragePercent ?? 20,
      overagePricePer1k: pricePer1k,
      blockAtMax: options.blockAtMax ?? true,
      onOverage: (e) => {
        void this.handleOverage(e);
      },
      ...options,
    };
  }

  listInvoices(userId?: string): InvoiceLineItem[] {
    return userId ? this.invoices.filter((i) => i.userId === userId) : [...this.invoices];
  }

  totalBilledAmount(): number {
    return this.totalBilled;
  }

  /**
   * Clear invoices.
   */
  clear(): void {
    this.invoices.length = 0;
    this.totalBilled = 0;
  }
}
