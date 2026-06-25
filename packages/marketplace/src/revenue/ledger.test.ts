import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Ledger } from './ledger.js';
import { RevenueManager } from './revenue-manager.js';
import { RevenueSplitter } from './split.js';
import type { Currency } from './types.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Marketplace Revenue Ledger & Manager Tests', () => {
  const testDbFile = path.resolve('test-ledger.sqlite');
  const USD: Currency = { code: 'USD', symbol: '$', decimals: 2 };

  afterEach(() => {
    // Clean up temporary database files
    try {
      if (fs.existsSync(testDbFile)) {
        fs.unlinkSync(testDbFile);
      }
    } catch {
      // Ignore cleanup failures
    }
  });

  describe('Ledger In-Memory Fallback Mode', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger(); // No path = in-memory fallback map/array
      ledger.setupRevenueAccounts(USD);
    });

    it('should create standard revenue accounts correctly', () => {
      const accounts = ledger.listAccounts();
      expect(accounts.length).toBe(6);
      expect(ledger.getAccount('cash')).toBeDefined();
      expect(ledger.getAccount('revenue')).toBeDefined();
      expect(ledger.getAccount('platform-fee')).toBeDefined();
      expect(ledger.getAccount('tax-payable')).toBeDefined();
    });

    it('should calculate balance correctly based on account type', () => {
      // cash (asset - debit account), revenue (revenue - credit account)
      ledger.record({
        refId: 'sale_1',
        description: 'First Sale',
        lines: [
          { accountId: 'cash', debit: 1000, credit: 0, memo: 'Receive cash' },
          { accountId: 'revenue', debit: 0, credit: 1000, memo: 'Gross revenue' },
        ],
      });

      expect(ledger.balance('cash')).toBe(1000); // debit - credit = 1000 - 0 = 1000
      expect(ledger.balance('revenue')).toBe(1000); // credit - debit = 1000 - 0 = 1000
    });

    it('should throw an error if ledger line is not balanced (debits != credits)', () => {
      expect(() => {
        ledger.record({
          refId: 'sale_fail',
          description: 'Unbalanced Sale',
          lines: [
            { accountId: 'cash', debit: 1000, credit: 0 },
            { accountId: 'revenue', debit: 0, credit: 800 }, // missing 200 cents
          ],
        });
      }).toThrow('Journal entry does not balance');
    });

    it('should throw an error when recording to an unknown account', () => {
      expect(() => {
        ledger.record({
          refId: 'sale_unknown',
          description: 'Unknown Account Sale',
          lines: [
            { accountId: 'cash', debit: 500, credit: 0 },
            { accountId: 'ghost-account', debit: 0, credit: 500 },
          ],
        });
      }).toThrow('Unknown account: ghost-account');
    });

    it('should query journal entries by refId and accountId', () => {
      ledger.record({
        refId: 'sale_abc',
        description: 'Product ABC Sale',
        lines: [
          { accountId: 'cash', debit: 500, credit: 0 },
          { accountId: 'revenue', debit: 0, credit: 500 },
        ],
      });

      const entriesByRef = ledger.entriesForRef('sale_abc');
      expect(entriesByRef.length).toBe(1);
      expect(entriesByRef[0]?.description).toBe('Product ABC Sale');

      const entriesByAccount = ledger.entriesForAccount('cash');
      expect(entriesByAccount.length).toBe(1);
      expect(entriesByAccount[0]?.refId).toBe('sale_abc');
    });
  });

  describe('Ledger SQLite Mode', () => {
    it('should initialize sqlite in-memory database and persist double-entry records', () => {
      const ledger = new Ledger(':memory:');
      ledger.setupRevenueAccounts(USD);

      const accounts = ledger.listAccounts();
      expect(accounts.length).toBe(6);

      ledger.record({
        refId: 'db_sale_1',
        description: 'Persistent Database Sale',
        lines: [
          { accountId: 'cash', debit: 2000, credit: 0 },
          { accountId: 'revenue', debit: 0, credit: 2000 },
        ],
      });

      expect(ledger.balance('cash')).toBe(2000);
      expect(ledger.balance('revenue')).toBe(2000);
      expect(ledger.entryCount).toBe(1);

      const entries = ledger.listEntries();
      expect(entries.length).toBe(1);
      expect(entries[0]?.lines.length).toBe(2);
    });

    it('should persist across physical db file rebuilds', () => {
      // 1. Open and write to a physical test db file
      const ledger = new Ledger(testDbFile);
      ledger.setupRevenueAccounts(USD);
      ledger.record({
        refId: 'phys_sale_1',
        description: 'Physical SQLite Sale',
        lines: [
          { accountId: 'cash', debit: 5000, credit: 0 },
          { accountId: 'revenue', debit: 0, credit: 5000 },
        ],
      });
      expect(ledger.balance('cash')).toBe(5000);
      expect(ledger.entryCount).toBe(1);

      // 2. Re-instantiate another Ledger targeting the same database file
      const secondLedger = new Ledger(testDbFile);
      expect(secondLedger.listAccounts().length).toBe(6);
      expect(secondLedger.balance('cash')).toBe(5000);
      expect(secondLedger.entryCount).toBe(1);
      
      const entries = secondLedger.entriesForRef('phys_sale_1');
      expect(entries.length).toBe(1);
      expect(entries[0]?.description).toBe('Physical SQLite Sale');
    });
  });

  describe('RevenueManager Flow Integration', () => {
    let manager: RevenueManager;

    beforeEach(() => {
      manager = new RevenueManager({
        payment: { provider: 'stripe', apiKey: 'sk_test_mock' },
        currency: USD,
        dbPath: ':memory:', // Persist ledger in sqlite memory mode
      });
    });

    it('should complete sale execution lifecycle and post balanced double-entry splits', async () => {
      // Configure simple split: 70% to author, 20% to platform, 10% to refund reserve
      const split = RevenueSplitter.default('product_1', 'author_123');
      manager.registerSplit('product_1', split);

      const res = await manager.executeSale({
        amount: 10000, // $100.00
        buyerId: 'buyer_999',
        productId: 'product_1',
        authorId: 'author_123',
      });

      expect(res.success).toBe(true);
      expect(res.payouts.length).toBe(3); // author, platform, reserve

      const authorPayout = res.payouts.find((p) => p.recipientId === 'author_123');
      const platformPayout = res.payouts.find((p) => p.recipientId === 'platform');
      const reservePayout = res.payouts.find((p) => p.recipientId === 'reserve');

      expect(authorPayout?.amount).toBe(7000);
      expect(platformPayout?.amount).toBe(2000);
      expect(reservePayout?.amount).toBe(1000);

      // Check balances in SQLite-backed Ledger
      const ledger = manager.getLedger();
      expect(ledger.balance('cash')).toBe(10000);
      expect(ledger.balance('revenue')).toBe(7000); // author share credited
      expect(ledger.balance('platform-fee')).toBe(2000); // platform fee credited
      expect(ledger.balance('refund-reserve')).toBe(1000); // reserve credited
      
      // Total assets (debit) = total liabilities & equity (credit)
      expect(ledger.balance('cash')).toBe(
        ledger.balance('revenue') + ledger.balance('platform-fee') + ledger.balance('refund-reserve')
      );
    });

    it('should withhold VAT and schedule taxes when country code is provided', async () => {
      const split = RevenueSplitter.default('product_taxed', 'author_456');
      manager.registerSplit('product_taxed', split);

      // Execute sale in VN (Vietnam has 5% withholding configured in mock tax rules)
      const res = await manager.executeSale({
        amount: 10000,
        buyerId: 'buyer_abc',
        productId: 'product_taxed',
        authorId: 'author_456',
        countryCode: 'VN', // Tax rule triggers 5% withhold rate
      });

      expect(res.success).toBe(true);
      
      const ledger = manager.getLedger();
      // Cash received is $100.00
      expect(ledger.balance('cash')).toBe(10000);
      expect(ledger.balance('revenue')).toBe(7000);
      expect(ledger.balance('platform-fee')).toBe(2000);

      // Check tax generation via TaxReporter
      const taxReporter = manager.getTaxReporter();
      const rule = taxReporter.ruleFor('VN');
      expect(rule.withholdBps).toBe(500); // 5%

      // Retrieve payouts to run manual tax generation check
      const taxedPayouts = res.payouts
        .filter((p) => p.recipientId === 'author_456')
        .map((p) => ({ ...p, paidAt: Date.now() }));
      const report = taxReporter.generate('author_456', 'VN', taxedPayouts, Date.now() - 10000, Date.now() + 10000, USD);
      expect(report.grossAmount).toBe(7000); // author gross payout amount
      expect(report.taxWithheld).toBe(350); // 5% of 7000 is 350 cents
      expect(report.netAmount).toBe(6650);

      // Verify that author payout is enqueued and processed in scheduler
      const scheduler = manager.getScheduler();
      scheduler.upsertSchedule({
        recipientId: 'author_456',
        cadence: 'daily',
        threshold: 1000, // $10.00 threshold
        active: true,
      });

      // Mark the pending payouts as ready/scheduled
      scheduler.readyForRecipient('author_456');

      // Process due payouts 2 days in the future (guaranteeing exceeding daily cadence nextRun at 9:00 AM tomorrow)
      const scheduledPayouts = scheduler.processDue(Date.now() + 48 * 60 * 60 * 1000);
      expect(scheduledPayouts.length).toBe(1);
      expect(scheduledPayouts[0]?.amount).toBe(7000);
      expect(scheduledPayouts[0]?.recipientId).toBe('author_456');
    });
  });
});
