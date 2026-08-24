import type { CapturedError, ErrorGroup } from './types.js';

export interface ErrorGrouperOptions {
  
  maxGroups?: number;
  
  maxEventsPerGroup?: number;
}

export class ErrorGrouper {
  private readonly groups = new Map<string, ErrorGroup>();
  private readonly maxGroups: number;
  private readonly maxEventsPerGroup: number;
  private totalErrors = 0;
  private droppedGroups = 0;

  constructor(options: ErrorGrouperOptions = {}) {
    this.maxGroups = options.maxGroups ?? 500;
    this.maxEventsPerGroup = options.maxEventsPerGroup ?? 100;
  }

  ingest(event: CapturedError): ErrorGroup {
    this.totalErrors++;
    const existing = this.groups.get(event.fingerprint);

    if (existing) {
      existing.count++;
      existing.lastSeen = event.timestamp;
      if (event.context.userId) existing.affectedUsers.add(event.context.userId);
      existing.events.push(event);
      if (existing.events.length > this.maxEventsPerGroup) {
        existing.events.shift();
      }
      return existing;
    }

    const group: ErrorGroup = {
      fingerprint: event.fingerprint,
      type: event.type,
      message: event.message,
      count: 1,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      affectedUsers: new Set(event.context.userId ? [event.context.userId] : []),
      events: [event],
    };
    this.groups.set(event.fingerprint, group);
    this.evictIfNeeded();
    return group;
  }

  get(fingerprint: string): ErrorGroup | undefined {
    return this.groups.get(fingerprint);
  }

  list(sortBy: 'count' | 'lastSeen' | 'firstSeen' = 'count'): ErrorGroup[] {
    const arr = Array.from(this.groups.values());
    return arr.sort((a, b) => {
      if (sortBy === 'lastSeen') return b.lastSeen - a.lastSeen;
      if (sortBy === 'firstSeen') return b.firstSeen - a.firstSeen;
      return b.count - a.count;
    });
  }

  top(n: number): ErrorGroup[] {
    return this.list('count').slice(0, n);
  }

  forget(fingerprint: string): boolean {
    return this.groups.delete(fingerprint);
  }

  clear(): void {
    this.groups.clear();
    this.totalErrors = 0;
    this.droppedGroups = 0;
  }

  stats(): { totalErrors: number; groupCount: number; droppedGroups: number; uniqueUsers: number } {
    const userSet = new Set<string>();
    for (const g of this.groups.values()) {
      for (const u of g.affectedUsers) userSet.add(u);
    }
    return {
      totalErrors: this.totalErrors,
      groupCount: this.groups.size,
      droppedGroups: this.droppedGroups,
      uniqueUsers: userSet.size,
    };
  }

  private evictIfNeeded(): void {
    if (this.groups.size <= this.maxGroups) return;
    const sorted = Array.from(this.groups.entries()).sort((a, b) => {
      if (a[1].count !== b[1].count) return a[1].count - b[1].count;
      return a[1].lastSeen - b[1].lastSeen;
    });
    const toEvict = sorted[0];
    if (toEvict) {
      this.groups.delete(toEvict[0]);
      this.droppedGroups++;
    }
  }
}
