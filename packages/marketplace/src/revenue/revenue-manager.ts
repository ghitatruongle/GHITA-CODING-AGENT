// Composes Payment + Split + Tax + Ledger into a unified revenue pipeline

import type {
  Currency,
  Payout,
  PaymentIntent,
  SplitConfig,
} from './types.js';
import { PaymentGateway } from './payment.js';
import { RevenueSplitter } from './split.js';
import { PayoutScheduler } from './payout.js';
import { TaxReporter } from './tax.js';
import { Ledger } from './ledger.js';

/** Result of a complete sale lifecycle */
export interface SaleResult {
  /** The captured payment intent */
  payment: PaymentIntent;
  /** Per-recipient payouts computed from the split */
  payouts: Payout[];
  /** Whether the sale was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Configuration for the RevenueManager */
export interface RevenueManagerConfig {
  /** Payment provider config */
  payment: { provider: 'stripe' | 'paypal' | 'lemonsqueezy' | 'paddle'; apiKey: string };
  /** Default currency for transactions */
  currency: Currency;
  /** Default split config (optional, applied if no per-product split given) */
  defaultSplit?: SplitConfig;
  /** Optional SQLite database path for Ledger persistence */
  dbPath?: string;
}

/**
 * Facade that orchestrates the full revenue lifecycle:
 *   1. Create payment intent
 *   2. Authorize + capture payment
 *   3. Compute revenue splits
 *   4. Record double-entry ledger transaction
 *   5. Enqueue payouts via PayoutScheduler
 *   6. Generate tax reports when needed
 */
export class RevenueManager {
  private payment: PaymentGateway;
  private splitter = new RevenueSplitter();
  private scheduler = new PayoutScheduler();
  private tax = new TaxReporter();
  private ledger: Ledger;
  private config: RevenueManagerConfig;
  private splits = new Map<string, SplitConfig>();

  constructor(config: RevenueManagerConfig) {
    this.config = config;
    this.payment = new PaymentGateway(config.payment);
    this.ledger = new Ledger(config.dbPath);
    // Set up standard ledger accounts
    this.ledger.setupRevenueAccounts(config.currency);
    if (config.defaultSplit) {
      this.splits.set(config.defaultSplit.productId, config.defaultSplit);
    }
  }

  /** Register a split config for a product. */
  registerSplit(productId: string, split: SplitConfig): void {
    this.splits.set(productId, split);
  }

  /** Get the underlying ledger for inspection. */
  getLedger(): Ledger {
    return this.ledger;
  }

  /** Get the underlying payment gateway. */
  getPaymentGateway(): PaymentGateway {
    return this.payment;
  }

  /** Get the payout scheduler. */
  getScheduler(): PayoutScheduler {
    return this.scheduler;
  }

  /** Get the tax reporter. */
  getTaxReporter(): TaxReporter {
    return this.tax;
  }

  /**
   * Execute a complete sale: payment → split → ledger → schedule payouts.
   */
  async executeSale(params: {
    amount: number;
    buyerId: string;
    productId: string;
    authorId: string;
    countryCode?: string;
    splitOverride?: SplitConfig;
  }): Promise<SaleResult> {
    const { amount, buyerId, productId, authorId, countryCode } = params;
    const currency = this.config.currency;

    // Resolve split config
    const split = params.splitOverride ?? this.splits.get(productId);
    if (!split) {
      return { payment: {} as PaymentIntent, payouts: [], success: false, error: 'No split config' };
    }

    // 1. Create payment intent
    let intent = this.payment.createIntent({ amount, currency, buyerId, productId });

    // 2. Authorize
    try {
      intent = this.payment.authorize(intent.id);
    } catch (err) {
      return {
        payment: intent,
        payouts: [],
        success: false,
        error: `Authorization failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 3. Capture
    try {
      intent = this.payment.capture(intent.id);
    } catch (err) {
      return {
        payment: intent,
        payouts: [],
        success: false,
        error: `Capture failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 4. Compute splits
    let payouts: Payout[];
    try {
      payouts = this.splitter.computePayouts(intent.id, split, amount, currency);
    } catch (err) {
      return {
        payment: intent,
        payouts: [],
        success: false,
        error: `Split failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 5. Record ledger entry
    this.recordSaleInLedger(intent, payouts, split, currency);

    // 6. Enqueue payouts
    for (const payout of payouts) {
      // Skip platform/reserve - they stay in the platform account
      if (payout.recipientId === 'platform' || payout.recipientId === 'reserve') continue;
      this.scheduler.enqueue(payout);
    }

    // 7. Tax report (if country provided)
    if (countryCode) {
      const rule = this.tax.ruleFor(countryCode);
      // Only generate if withholding is needed
      if (rule.withholdBps > 0) {
        // Stamp payouts with the capture time so TaxReporter can include them
        const taxedPayouts = payouts
          .filter((p) => p.recipientId === authorId)
          .map((p) => ({ ...p, paidAt: intent.createdAt }));
        this.tax.generate(authorId, countryCode, taxedPayouts, intent.createdAt, Date.now(), currency);
      }
    }

    return { payment: intent, payouts, success: true };
  }

  /** Process all due payouts. */
  processDuePayouts(now?: number): Payout[] {
    return this.scheduler.processDue(now);
  }

  /**
   * Record a sale as a balanced double-entry journal entry:
   *   Debit:  Cash (full amount)
   *   Credit: Revenue (author share), Platform Fee (platform share), Tax Payable (tax share)
   */
  private recordSaleInLedger(
    intent: PaymentIntent,
    payouts: Payout[],
    _split: SplitConfig,
    _currency: Currency,
  ): void {
    const lines = [];

    // Debit cash for the full amount
    lines.push({ accountId: 'cash', debit: intent.amount, credit: 0, memo: 'Payment received' });

    // Credit each payout recipient based on their role
    for (const payout of payouts) {
      const accountKey =
        payout.recipientId === 'platform'
          ? 'platform-fee'
          : payout.recipientId === 'reserve'
            ? 'refund-reserve'
            : payout.recipientId === 'tax'
              ? 'tax-payable'
              : 'revenue';
      lines.push({
        accountId: accountKey,
        debit: 0,
        credit: payout.amount,
        memo: `Payout to ${payout.recipientId}`,
      });
    }

    this.ledger.record({
      refId: intent.id,
      description: `Sale of ${intent.productId} by ${intent.buyerId}`,
      lines,
    });
  }
}
