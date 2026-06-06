// ==============================================================================
// GHITA CODING AGENT - Tax Reporting (Phase 38)
// ==============================================================================

import { randomUUID } from 'node:crypto';
import type { Payout, TaxReport } from './types.js';

/** Country-specific tax rules (simplified) */
interface TaxRule {
  /** Withhold rate in bps */
  withholdBps: number;
  /** 1099/W-8 threshold in USD cents */
  thresholdCents: number;
}

const RULES: Record<string, TaxRule> = {
  US: { withholdBps: 0, thresholdCents: 60000 },
  VN: { withholdBps: 500, thresholdCents: 100000 },
  DE: { withholdBps: 0, thresholdCents: 0 },
  JP: { withholdBps: 1020, thresholdCents: 100000 },
  GB: { withholdBps: 0, thresholdCents: 100000 },
};

const DEFAULT_RULE: TaxRule = { withholdBps: 0, thresholdCents: 100000 };

/**
 * Generates tax reports and withholdings for a recipient over a period.
 */
export class TaxReporter {
  /**
   * Get the tax rule for a country (falls back to default).
   */
  ruleFor(countryCode: string): TaxRule {
    return RULES[countryCode] ?? DEFAULT_RULE;
  }

  /**
   * Generate a tax report for a recipient over [periodStart, periodEnd].
   */
  generate(
    recipientId: string,
    countryCode: string,
    payouts: Payout[],
    periodStart: number,
    periodEnd: number,
    currency: { code: string; symbol: string; decimals: number },
  ): TaxReport {
    const rule = this.ruleFor(countryCode);
    const inPeriod = payouts.filter((p) => p.paidAt !== undefined && p.paidAt >= periodStart && p.paidAt <= periodEnd);
    const gross = inPeriod.reduce((acc, p) => acc + p.amount, 0);
    const taxWithheld = Math.floor((gross * rule.withholdBps) / 10_000);
    const net = gross - taxWithheld;

    return {
      id: `tax_${randomUUID()}`,
      recipientId,
      periodStart,
      periodEnd,
      grossAmount: gross,
      taxWithheld,
      netAmount: net,
      currency,
      generatedAt: Date.now(),
      countryCode,
      thresholdMet: gross >= rule.thresholdCents,
    };
  }

  /**
   * Export a report as CSV row(s).
   */
  toCsv(report: TaxReport): string {
    const header = 'id,recipient,period_start,period_end,country,gross,withheld,net,threshold_met';
    const row = [
      report.id,
      report.recipientId,
      new Date(report.periodStart).toISOString(),
      new Date(report.periodEnd).toISOString(),
      report.countryCode,
      (report.grossAmount / Math.pow(10, report.currency.decimals)).toFixed(report.currency.decimals),
      (report.taxWithheld / Math.pow(10, report.currency.decimals)).toFixed(report.currency.decimals),
      (report.netAmount / Math.pow(10, report.currency.decimals)).toFixed(report.currency.decimals),
      report.thresholdMet ? 'YES' : 'NO',
    ].join(',');
    return `${header}\n${row}`;
  }
}
