// Records where each memory came from (agent, namespace, source, snapshot)
// and supports git-style rollback to a previous version.

import { createHash } from 'node:crypto';

export type Namespace = 'public' | 'private';

export interface ProvenanceRecord {
  memoryId: string;
  agentId: string;
  namespace: Namespace;
  /** Source observation (e.g. tool call id, file, session). */
  source: string;
  snapshotHash: string;
  /** Previous version id (rollback target), if any. */
  prevVersionId?: string;
  at: number;
}

export function snapshotHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 24);
}

export class ProvenanceStore {
  private records = new Map<string, ProvenanceRecord[]>();

  /** Record a new memory version with provenance. */
  record(
    entry: Omit<ProvenanceRecord, 'snapshotHash' | 'at'> & { content: string },
  ): ProvenanceRecord {
    const history = this.records.get(entry.memoryId) ?? [];
    const prev = history[history.length - 1];
    const record: ProvenanceRecord = {
      memoryId: entry.memoryId,
      agentId: entry.agentId,
      namespace: entry.namespace,
      source: entry.source,
      snapshotHash: snapshotHash(entry.content),
      prevVersionId: prev?.snapshotHash,
      at: Date.now(),
    };
    history.push(record);
    this.records.set(entry.memoryId, history);
    return record;
  }

  history(memoryId: string): ProvenanceRecord[] {
    return this.records.get(memoryId) ?? [];
  }

  /** The latest snapshot hash of a memory (rollback target = previous). */
  latest(memoryId: string): ProvenanceRecord | undefined {
    const history = this.records.get(memoryId);
    return history?.[history.length - 1];
  }

  /** Roll back: returns the previous record (the version to restore). */
  rollback(memoryId: string): ProvenanceRecord | undefined {
    const history = this.records.get(memoryId);
    if (!history || history.length < 2) return undefined;
    history.pop();
    return history[history.length - 1];
  }

  /** Namespaced listing for multi-agent isolation. */
  listByNamespace(namespace: Namespace, agentId?: string): ProvenanceRecord[] {
    const out: ProvenanceRecord[] = [];
    for (const history of this.records.values()) {
      for (const record of history) {
        if (record.namespace !== namespace) continue;
        if (agentId && record.agentId !== agentId) continue;
        out.push(record);
      }
    }
    return out;
  }

  /** Verify an entry's snapshot integrity. */
  verify(memoryId: string, content: string): boolean {
    const latest = this.latest(memoryId);
    if (!latest) return false;
    return latest.snapshotHash === snapshotHash(content);
  }

  clear(): void {
    this.records.clear();
  }
}
