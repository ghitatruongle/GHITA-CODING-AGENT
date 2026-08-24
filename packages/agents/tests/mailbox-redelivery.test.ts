// Regression tests for the Track 2 bug fixes (at-least-once mailbox redelivery).
import { describe, expect, it } from 'vitest';
import { MailboxStore } from '../src/mailbox/store.js';

function makeStore(): MailboxStore {
  return new MailboxStore({ dbPath: ':memory:' });
}

describe('MailboxStore at-least-once redelivery', () => {
  it('marks checked messages in_flight and does not redeliver before ack timeout', () => {
    const store = makeStore();
    store.send('a', 'b', { hello: 'world' });

    const first = store.check('b');
    expect(first).toHaveLength(1);
    expect(first[0]?.status).toBe('delivered');

    // Not acked yet — must NOT come back immediately.
    expect(store.check('b')).toHaveLength(0);
  });

  it('redelivers un-acked messages after the visibility timeout (crash recovery)', () => {
    const store = makeStore();
    store.send('a', 'b', { payload: 1 });

    const first = store.check('b');
    expect(first).toHaveLength(1);

    // Simulate a consumer that died: backdate the in-flight delivery past the
    // visibility timeout.
    const db = (store as unknown as { db: { prepare(sql: string): { run(...args: unknown[]): void } } }).db;
    db.prepare(
      `UPDATE mailbox_deliveries SET last_delivered_at = ? WHERE recipient = 'b'`,
    ).run(Date.now() - (MailboxStore.VISIBILITY_TIMEOUT_MS + 1000));

    const redelivered = store.check('b');
    expect(redelivered).toHaveLength(1);
    expect(redelivered[0]?.message.id).toBe(first[0]?.message.id);
    expect(redelivered[0]?.deliveryCount).toBe(2);
  });

  it('acked messages are never redelivered', () => {
    const store = makeStore();
    store.send('a', 'b', { payload: 2 });

    const [rec] = store.check('b');
    expect(rec).toBeTruthy();
    expect(store.ack('b', rec!.message.id)).toBe(true);

    const db = (store as unknown as { db: { prepare(sql: string): { run(...args: unknown[]): void } } }).db;
    db.prepare(
      `UPDATE mailbox_deliveries SET last_delivered_at = ? WHERE recipient = 'b'`,
    ).run(Date.now() - (MailboxStore.VISIBILITY_TIMEOUT_MS + 1000));

    expect(store.check('b')).toHaveLength(0);
  });
});
