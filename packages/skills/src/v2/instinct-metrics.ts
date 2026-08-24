// Tracks instinct/skill trigger hits & misses to measure trigger accuracy and
// tune thresholds (precision over time).

export interface TriggerEvent {
  skillId: string;
  hit: boolean;
  at: number;
}

export interface TriggerStats {
  skillId: string;
  hits: number;
  misses: number;
  total: number;
  /** Precision = hits / total. */
  precision: number;
}

export class InstinctTriggerMetrics {
  private readonly events = new Map<string, TriggerEvent[]>();

  /** Record a trigger decision for a skill. */
  record(skillId: string, hit: boolean, at: number = Date.now()): void {
    const list = this.events.get(skillId) ?? [];
    list.push({ skillId, hit, at });
    this.events.set(skillId, list);
  }

  /** Per-skill precision stats over the recorded window. */
  stats(skillId: string, since?: number): TriggerStats {
    const list = (this.events.get(skillId) ?? []).filter(
      (e) => since === undefined || e.at >= since,
    );
    const hits = list.filter((e) => e.hit).length;
    const total = list.length;
    return {
      skillId,
      hits,
      misses: total - hits,
      total,
      precision: total === 0 ? 0 : hits / total,
    };
  }

  /** All skills with at least one recorded event. */
  all(since?: number): TriggerStats[] {
    const ids = [...this.events.keys()];
    return ids.map((id) => this.stats(id, since)).sort((a, b) => b.total - a.total);
  }

  /** Suggest re-writing description when precision stays below threshold. */
  suggestion(skillId: string, threshold = 0.5): string | undefined {
    const s = this.stats(skillId);
    if (s.total < 3) return undefined;
    if (s.precision < threshold) {
      return `skill "${skillId}" trigger precision ${Math.round(s.precision * 100)}% below ${Math.round(threshold * 100)}% — consider adding trigger verbs to description`;
    }
    return undefined;
  }

  clear(skillId?: string): void {
    if (skillId) this.events.delete(skillId);
    else this.events.clear();
  }
}
