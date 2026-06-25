// ==============================================================================
// GHITA CODING AGENT - Double-Entry Ledger (Phase 38)
// Immutable transaction log with debit/credit balance tracking & SQLite Persistence
// ==============================================================================

import DatabaseCtor from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Currency } from './types.js';

/** Account type in the ledger */
export type AccountType = 'asset' | 'liability' | 'revenue' | 'expense';

/** A ledger account */
export interface LedgerAccount {
  /** Account ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Account type */
  type: AccountType;
  /** Currency for this account */
  currency: Currency;
}

/** A single line in a journal entry (debit or credit) */
export interface LedgerLine {
  /** Account ID */
  accountId: string;
  /** Debit amount (cents). Positive for debits. */
  debit: number;
  /** Credit amount (cents). Positive for credits. */
  credit: number;
  /** Description / memo */
  memo?: string;
}

/** An immutable journal entry (transaction) */
export interface JournalEntry {
  /** Entry ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Reference ID (e.g. payment intent ID) */
  refId: string;
  /** Description */
  description: string;
  /** Lines - must balance (sum of debits == sum of credits) */
  lines: LedgerLine[];
}

/**
 * Double-entry ledger that tracks all revenue transactions.
 *
 * Every journal entry must balance: total debits == total credits.
 * This ensures that every cent is accounted for across splits,
 * taxes, platform fees, and payouts.
 */
export class Ledger {
  private db: DatabaseCtor.Database | null = null;
  private accounts = new Map<string, LedgerAccount>();
  private entries: JournalEntry[] = [];

  constructor(dbPath?: string) {
    if (dbPath !== undefined) {
      try {
        this.db = new DatabaseCtor(dbPath);
        this.db.exec(`
          PRAGMA foreign_keys = ON;
          CREATE TABLE IF NOT EXISTS ledger_accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            currency TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS journal_entries (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            ref_id TEXT NOT NULL,
            description TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ledger_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            debit INTEGER NOT NULL,
            credit INTEGER NOT NULL,
            memo TEXT,
            FOREIGN KEY(entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
            FOREIGN KEY(account_id) REFERENCES ledger_accounts(id)
          );
          CREATE INDEX IF NOT EXISTS idx_lines_entry ON ledger_lines(entry_id);
          CREATE INDEX IF NOT EXISTS idx_lines_account ON ledger_lines(account_id);
          CREATE INDEX IF NOT EXISTS idx_entries_ref ON journal_entries(ref_id);
        `);
      } catch (err) {
        console.warn('[Ledger] Failed to initialize SQLite, falling back to in-memory store:', err);
        this.db = null;
      }
    }
  }

  /** Create or update a ledger account. */
  upsertAccount(id: string, name: string, type: AccountType, currency: Currency): LedgerAccount {
    const account: LedgerAccount = { id, name, type, currency };
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO ledger_accounts (id, name, type, currency)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, currency = excluded.currency
      `);
      stmt.run(id, name, type, JSON.stringify(currency));
    } else {
      this.accounts.set(id, account);
    }
    return account;
  }

  /** Get account by ID. */
  getAccount(id: string): LedgerAccount | undefined {
    if (this.db) {
      const row = this.db
        .prepare('SELECT id, name, type, currency FROM ledger_accounts WHERE id = ?')
        .get(id) as { id: string; name: string; type: string; currency: string } | undefined;
      if (row) {
        return {
          id: row.id,
          name: row.name,
          type: row.type as AccountType,
          currency: JSON.parse(row.currency),
        };
      }
      return undefined;
    }
    return this.accounts.get(id);
  }

  /** List all accounts. */
  listAccounts(): LedgerAccount[] {
    if (this.db) {
      const rows = this.db
        .prepare('SELECT id, name, type, currency FROM ledger_accounts')
        .all() as Array<{ id: string; name: string; type: string; currency: string }>;
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type as AccountType,
        currency: JSON.parse(row.currency),
      }));
    }
    return Array.from(this.accounts.values());
  }

  /**
   * Record a journal entry. Validates that debits == credits.
   * Throws if the entry does not balance.
   */
  record(entry: Omit<JournalEntry, 'id' | 'timestamp'>): JournalEntry {
    const totalDebit = entry.lines.reduce((acc, l) => acc + l.debit, 0);
    const totalCredit = entry.lines.reduce((acc, l) => acc + l.credit, 0);

    if (totalDebit !== totalCredit) {
      throw new Error(
        `Journal entry does not balance: debits=${totalDebit}, credits=${totalCredit}`,
      );
    }

    // Validate all accounts exist
    for (const line of entry.lines) {
      if (this.db) {
        const row = this.db.prepare('SELECT COUNT(*) as count FROM ledger_accounts WHERE id = ?').get(line.accountId) as { count: number };
        if (row.count === 0) {
          throw new Error(`Unknown account: ${line.accountId}`);
        }
      } else {
        if (!this.accounts.has(line.accountId)) {
          throw new Error(`Unknown account: ${line.accountId}`);
        }
      }
    }

    const full: JournalEntry = {
      id: `je_${randomUUID()}`,
      timestamp: Date.now(),
      refId: entry.refId,
      description: entry.description,
      lines: entry.lines,
    };

    if (this.db) {
      const insertEntry = this.db.prepare(`
        INSERT INTO journal_entries (id, timestamp, ref_id, description)
        VALUES (?, ?, ?, ?)
      `);
      const insertLine = this.db.prepare(`
        INSERT INTO ledger_lines (entry_id, account_id, debit, credit, memo)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const transaction = this.db.transaction((ent: JournalEntry) => {
        insertEntry.run(ent.id, ent.timestamp, ent.refId, ent.description);
        for (const line of ent.lines) {
          insertLine.run(ent.id, line.accountId, line.debit, line.credit, line.memo ?? null);
        }
      });
      transaction(full);
    } else {
      this.entries.push(full);
    }
    return full;
  }

  /**
   * Get the balance for a specific account.
   * Debit accounts (asset, expense): balance = sum(debits) - sum(credits)
   * Credit accounts (liability, revenue): balance = sum(credits) - sum(debits)
   */
  balance(accountId: string): number {
    const account = this.getAccount(accountId);
    if (!account) return 0;

    const isDebitAccount = account.type === 'asset' || account.type === 'expense';

    if (this.db) {
      const row = this.db.prepare(`
        SELECT SUM(debit) as total_debit, SUM(credit) as total_credit
        FROM ledger_lines
        WHERE account_id = ?
      `).get(accountId) as { total_debit: number | null; total_credit: number | null };
      
      const totalDebit = row.total_debit ?? 0;
      const totalCredit = row.total_credit ?? 0;
      return isDebitAccount ? totalDebit - totalCredit : totalCredit - totalDebit;
    }

    let total = 0;
    for (const entry of this.entries) {
      for (const line of entry.lines) {
        if (line.accountId !== accountId) continue;
        if (isDebitAccount) {
          total += line.debit - line.credit;
        } else {
          total += line.credit - line.debit;
        }
      }
    }
    return total;
  }

  /** Get all journal entries. */
  listEntries(): JournalEntry[] {
    if (this.db) {
      const dbEntries = this.db.prepare('SELECT id, timestamp, ref_id as refId, description FROM journal_entries').all() as Omit<JournalEntry, 'lines'>[];
      const dbLines = this.db.prepare('SELECT entry_id, account_id as accountId, debit, credit, memo FROM ledger_lines').all() as (LedgerLine & { entry_id: string })[];

      const linesByEntry = new Map<string, LedgerLine[]>();
      for (const line of dbLines) {
        const list = linesByEntry.get(line.entry_id) ?? [];
        list.push({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          memo: line.memo ?? undefined,
        });
        linesByEntry.set(line.entry_id, list);
      }

      return dbEntries.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        refId: e.refId,
        description: e.description,
        lines: linesByEntry.get(e.id) ?? [],
      }));
    }
    return [...this.entries];
  }

  /** Get journal entries for a specific reference ID. */
  entriesForRef(refId: string): JournalEntry[] {
    if (this.db) {
      const dbEntries = this.db.prepare('SELECT id, timestamp, ref_id as refId, description FROM journal_entries WHERE ref_id = ?').all(refId) as Omit<JournalEntry, 'lines'>[];
      if (dbEntries.length === 0) return [];
      
      const dbLines = this.db.prepare(`
        SELECT l.entry_id, l.account_id as accountId, l.debit, l.credit, l.memo
        FROM ledger_lines l
        JOIN journal_entries e ON l.entry_id = e.id
        WHERE e.ref_id = ?
      `).all(refId) as (LedgerLine & { entry_id: string })[];

      const linesByEntry = new Map<string, LedgerLine[]>();
      for (const line of dbLines) {
        const list = linesByEntry.get(line.entry_id) ?? [];
        list.push({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          memo: line.memo ?? undefined,
        });
        linesByEntry.set(line.entry_id, list);
      }

      return dbEntries.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        refId: e.refId,
        description: e.description,
        lines: linesByEntry.get(e.id) ?? [],
      }));
    }
    return this.entries.filter((e) => e.refId === refId);
  }

  /** Get journal entries affecting a specific account. */
  entriesForAccount(accountId: string): JournalEntry[] {
    if (this.db) {
      const dbEntries = this.db.prepare(`
        SELECT DISTINCT e.id, e.timestamp, e.ref_id as refId, e.description
        FROM journal_entries e
        JOIN ledger_lines l ON e.id = l.entry_id
        WHERE l.account_id = ?
      `).all(accountId) as Omit<JournalEntry, 'lines'>[];
      if (dbEntries.length === 0) return [];

      const placeholders = dbEntries.map(() => '?').join(',');
      const ids = dbEntries.map((e) => e.id);
      
      const dbLines = this.db.prepare(`
        SELECT entry_id, account_id as accountId, debit, credit, memo
        FROM ledger_lines
        WHERE entry_id IN (${placeholders})
      `).all(...ids) as (LedgerLine & { entry_id: string })[];

      const linesByEntry = new Map<string, LedgerLine[]>();
      for (const line of dbLines) {
        const list = linesByEntry.get(line.entry_id) ?? [];
        list.push({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          memo: line.memo ?? undefined,
        });
        linesByEntry.set(line.entry_id, list);
      }

      return dbEntries.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        refId: e.refId,
        description: e.description,
        lines: linesByEntry.get(e.id) ?? [],
      }));
    }
    return this.entries.filter((e) => e.lines.some((l) => l.accountId === accountId));
  }

  /** Total number of journal entries recorded. */
  get entryCount(): number {
    if (this.db) {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM journal_entries').get() as { count: number };
      return row.count;
    }
    return this.entries.length;
  }

  /**
   * Create standard revenue accounts for a product sale.
   * Sets up: cash (asset), revenue (revenue), platform-fee (revenue), tax-payable (liability).
   */
  setupRevenueAccounts(currency: Currency): {
    cash: LedgerAccount;
    revenue: LedgerAccount;
    platformFee: LedgerAccount;
    taxPayable: LedgerAccount;
    payouts: LedgerAccount;
    refundReserve: LedgerAccount;
  } {
    const cash = this.upsertAccount('cash', 'Cash / Payment Gateway', 'asset', currency);
    const revenue = this.upsertAccount('revenue', 'Gross Revenue', 'revenue', currency);
    const platformFee = this.upsertAccount('platform-fee', 'Platform Fee', 'revenue', currency);
    const taxPayable = this.upsertAccount('tax-payable', 'Tax Payable', 'liability', currency);
    const payouts = this.upsertAccount('payouts', 'Author Payouts', 'expense', currency);
    const refundReserve = this.upsertAccount('refund-reserve', 'Refund Reserve', 'liability', currency);
    return { cash, revenue, platformFee, taxPayable, payouts, refundReserve };
  }
}
