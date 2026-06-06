// ==============================================================================
// GHITA CODING AGENT - Revenue Sharing Module Barrel Export (Phase 38)
// ==============================================================================

// --- Types ---
export type {
  PaymentProvider,
  PaymentStatus,
  Currency,
  PaymentIntent,
  RevenueSplit,
  SplitConfig,
  Payout,
  PayoutSchedule,
  TaxReport,
} from './types.js';

// --- Modules ---
export { PaymentGateway } from './payment.js';
export { RevenueSplitter } from './split.js';
export { PayoutScheduler } from './payout.js';
export { TaxReporter } from './tax.js';
