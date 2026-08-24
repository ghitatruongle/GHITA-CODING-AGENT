import { randomUUID } from 'node:crypto';
import type { Payout, RevenueSplit, SplitConfig } from './types.js';

const TOTAL_BPS = 10_000; // 100% = 10000 basis points

/**
 * Validate + apply a RevenueSplit configuration to compute payouts per recipient.
 * All math done in integer basis points to avoid floating-point loss.
 */
export class RevenueSplitter {
  /**
   * Validate a split config: total must equal 10000 bps and roles must be unique per recipient/role combo.
   */
  validate(config: SplitConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const sum = config.splits.reduce((acc, s) => acc + s.basisPoints, 0);
    if (sum !== TOTAL_BPS) {
      errors.push(`Sum of basisPoints is ${sum}, expected ${TOTAL_BPS}`);
    }
    if (config.totalBasisPoints !== sum) {
      errors.push(`totalBasisPoints (${config.totalBasisPoints}) does not match sum (${sum})`);
    }
    const seen = new Set<string>();
    for (const s of config.splits) {
      if (s.basisPoints < 0) errors.push(`Negative basisPoints for ${s.recipientId}`);
      const key = `${s.recipientId}:${s.role}`;
      if (seen.has(key)) errors.push(`Duplicate role ${s.role} for ${s.recipientId}`);
      seen.add(key);
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Compute payouts for a payment amount.
   * Largest-remainder method to ensure cents add up exactly.
   */
  computePayouts(
    paymentIntentId: string,
    config: SplitConfig,
    totalCents: number,
    currency: { code: string; symbol: string; decimals: number },
  ): Payout[] {
    const validation = this.validate(config);
    if (!validation.valid) {
      throw new Error(`Invalid split config: ${validation.errors.join('; ')}`);
    }

    const rawAmounts = config.splits.map((s) => ({
      split: s,
      raw: (totalCents * s.basisPoints) / TOTAL_BPS,
    }));

    const floored = rawAmounts.map((x) => ({
      ...x,
      amount: Math.floor(x.raw),
      remainder: x.raw - Math.floor(x.raw),
    }));

    const allocated = floored.reduce((acc, x) => acc + x.amount, 0);
    let leftover = totalCents - allocated;
    const sorted = [...floored].sort((a, b) => b.remainder - a.remainder);
    for (const item of sorted) {
      if (leftover <= 0) break;
      item.amount += 1;
      leftover -= 1;
    }

    return floored.map((x) => ({
      id: `po_${randomUUID()}`,
      recipientId: x.split.recipientId,
      paymentIntentId,
      amount: x.amount,
      currency,
      basisPoints: x.split.basisPoints,
      status: 'pending' as const,
    }));
  }

  /**
   * Add or update a split rule.
   */
  updateSplit(config: SplitConfig, split: RevenueSplit): SplitConfig {
    const others = config.splits.filter(
      (s) => !(s.recipientId === split.recipientId && s.role === split.role),
    );
    const splits = [...others, split];
    const total = splits.reduce((acc, s) => acc + s.basisPoints, 0);
    return { ...config, splits, totalBasisPoints: total };
  }

  /**
   * Create a default platform-friendly split (70% author, 20% platform, 10% reserve).
   */
  static default(productId: string, authorId: string): SplitConfig {
    const splits: RevenueSplit[] = [
      {
        id: randomUUID(),
        recipientId: authorId,
        role: 'author',
        basisPoints: 7000,
        name: 'Author',
      },
      {
        id: randomUUID(),
        recipientId: 'platform',
        role: 'platform',
        basisPoints: 2000,
        name: 'GHITA Platform',
      },
      {
        id: randomUUID(),
        recipientId: 'reserve',
        role: 'reserve',
        basisPoints: 1000,
        name: 'Refund Reserve',
      },
    ];
    return { productId, splits, totalBasisPoints: TOTAL_BPS };
  }
}
