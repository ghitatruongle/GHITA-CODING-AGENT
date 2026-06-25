// ==============================================================================
// Phase 32: Alert Rules Engine
// ==============================================================================

import type { AlertRule, AlertEvent, CapturedError, Severity } from './types.js';

interface RuleState {
  /** Timestamps các lần trigger trong window hiện tại */
  occurrences: number[];
  /** Timestamp lần cuối fire alert (để enforce cooldown) */
  lastFiredAt: number;
}

/**
 * AlertEngine — đánh giá AlertRule dựa trên error events.
 *
 * Mỗi rule có:
 *  - pattern: regex match error message hoặc fingerprint
 *  - threshold: số lần xảy ra trong windowMs
 *  - cooldownMs: thời gian chờ giữa 2 lần fire
 */
export class AlertEngine {
  private readonly rules = new Map<string, AlertRule>();
  private readonly state = new Map<string, RuleState>();
  private alertsTriggered = 0;
  private readonly onLog?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;

  constructor(
    options: {
      logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
    } = {},
  ) {
    this.onLog = options.logger;
  }

  /**
   * Đăng ký alert rule.
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.state.set(rule.id, { occurrences: [], lastFiredAt: 0 });
    this.log('debug', `Alert rule registered: ${rule.id} (${rule.name})`);
  }

  /**
   * Xóa rule.
   */
  removeRule(id: string): boolean {
    const ok = this.rules.delete(id);
    this.state.delete(id);
    return ok;
  }

  /**
   * Bật/tắt rule.
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;
    rule.enabled = enabled;
    return true;
  }

  /**
   * Liệt kê tất cả rule.
   */
  listRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Feed error event vào engine. Trigger alert nếu rule khớp và đạt threshold.
   */
  async evaluate(event: CapturedError): Promise<AlertEvent[]> {
    const triggered: AlertEvent[] = [];
    const now = event.timestamp;

    for (const [id, rule] of this.rules) {
      if (!rule.enabled) continue;
      if (!this.matchesRule(event, rule)) continue;
      if (!this.severityOk(event.severity, rule.minSeverity)) continue;

      const state = this.state.get(id);
      if (!state) continue;

      // Prune occurrences ngoài window
      state.occurrences = state.occurrences.filter((t) => now - t < rule.windowMs);
      state.occurrences.push(now);

      if (state.occurrences.length >= rule.threshold) {
        if (now - state.lastFiredAt >= rule.cooldownMs) {
          const alert: AlertEvent = {
            ruleId: rule.id,
            ruleName: rule.name,
            severity: event.severity,
            count: state.occurrences.length,
            sampleMessage: event.message,
            timestamp: now,
          };
          triggered.push(alert);
          state.lastFiredAt = now;
          this.alertsTriggered++;
          this.log(
            'warn',
            `[Alert] ${rule.name} fired (count=${state.occurrences.length}, severity=${event.severity})`,
          );

          if (rule.onTrigger) {
            try {
              await rule.onTrigger(alert);
            } catch (err) {
              this.log(
                'error',
                `[Alert] onTrigger callback failed for ${rule.id}: ${(err as Error).message}`,
              );
            }
          }
        }
      }
    }

    return triggered;
  }

  /**
   * Lấy stats.
   */
  stats(): { rulesCount: number; activeRules: number; alertsTriggered: number } {
    return {
      rulesCount: this.rules.size,
      activeRules: Array.from(this.rules.values()).filter((r) => r.enabled).length,
      alertsTriggered: this.alertsTriggered,
    };
  }

  /**
   * Reset state cho 1 rule (vd: khi disable).
   */
  resetState(id: string): void {
    const state = this.state.get(id);
    if (state) {
      state.occurrences = [];
      state.lastFiredAt = 0;
    }
  }

  /**
   * Xóa tất cả rule.
   */
  clear(): void {
    this.rules.clear();
    this.state.clear();
    this.alertsTriggered = 0;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private matchesRule(event: CapturedError, rule: AlertRule): boolean {
    try {
      const re = new RegExp(rule.pattern, 'i');
      return re.test(event.message) || re.test(event.fingerprint) || re.test(event.type);
    } catch {
      return false;
    }
  }

  private severityOk(eventSev: Severity, minSev: Severity): boolean {
    const order: Severity[] = ['debug', 'info', 'warning', 'error', 'fatal'];
    return order.indexOf(eventSev) >= order.indexOf(minSev);
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', msg: string): void {
    this.onLog?.(msg, level);
  }
}
