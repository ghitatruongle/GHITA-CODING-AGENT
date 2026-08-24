/** Supported payment providers */
export type PaymentProvider = 'stripe' | 'paypal' | 'lemonsqueezy' | 'paddle';

/** Payment intent status */
export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'refunded'
  | 'failed'
  | 'cancelled';

/** Currency */
export interface Currency {
  /** ISO 4217 code */
  code: string;
  /** Symbol */
  symbol: string;
  /** Decimal places */
  decimals: number;
}

/** Payment intent */
export interface PaymentIntent {
  /** Intent ID */
  id: string;
  /** Provider */
  provider: PaymentProvider;
  /** Amount in smallest currency unit (cents) */
  amount: number;
  /** Currency */
  currency: Currency;
  /** Buyer user ID */
  buyerId: string;
  /** What is being purchased */
  productId: string;
  /** Status */
  status: PaymentStatus;
  /** Creation timestamp */
  createdAt: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Provider-specific ID */
  providerRef?: string;
}

/** Revenue split definition (who gets what %) */
export interface RevenueSplit {
  /** Split rule ID */
  id: string;
  /** Recipient user ID */
  recipientId: string;
  /** Recipient role (author, platform, contributor) */
  role: 'author' | 'contributor' | 'platform' | 'tax' | 'reserve';
  /** Share in basis points (100 = 1%) */
  basisPoints: number;
  /** Display name */
  name: string;
}

/** Full split configuration for a product */
export interface SplitConfig {
  /** Product ID */
  productId: string;
  /** All recipients */
  splits: RevenueSplit[];
  /** Validation: must sum to 10000 bps */
  totalBasisPoints: number;
}

/** Calculated payout per recipient */
export interface Payout {
  /** Payout ID */
  id: string;
  /** Recipient user ID */
  recipientId: string;
  /** Source payment intent */
  paymentIntentId: string;
  /** Amount in smallest currency unit */
  amount: number;
  /** Currency */
  currency: Currency;
  /** Computed basis points applied */
  basisPoints: number;
  /** Status */
  status: 'pending' | 'scheduled' | 'paid' | 'failed';
  /** Scheduled date (ms) */
  scheduledFor?: number;
  /** Paid timestamp */
  paidAt?: number;
}

/** Payout schedule (e.g. monthly on 1st) */
export interface PayoutSchedule {
  /** Schedule ID */
  id: string;
  /** Recipient */
  recipientId: string;
  /** Cadence */
  cadence: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  /** Minimum threshold (cents) */
  threshold: number;
  /** Day of month (1-31) for monthly */
  dayOfMonth?: number;
  /** Next scheduled run */
  nextRun: number;
  /** Whether active */
  active: boolean;
}

/** Tax form/report */
export interface TaxReport {
  /** Report ID */
  id: string;
  /** Recipient user ID */
  recipientId: string;
  /** Period start */
  periodStart: number;
  /** Period end */
  periodEnd: number;
  /** Total gross (cents) */
  grossAmount: number;
  /** Tax withheld (cents) */
  taxWithheld: number;
  /** Net payout (cents) */
  netAmount: number;
  /** Currency */
  currency: Currency;
  /** Generated at */
  generatedAt: number;
  /** Country code (jurisdiction) */
  countryCode: string;
  /** Whether form 1099/W-8BEN threshold met */
  thresholdMet: boolean;
}
