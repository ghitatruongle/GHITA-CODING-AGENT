// ==============================================================================
// GHITA CODING AGENT - Cron & Natural Language Scheduler
// ==============================================================================

import type { AgentManager } from '../index.js';
import type { ScheduledTask, ScheduledTaskConfig } from './types.js';

export class CronScheduler {
  private readonly tasks = new Map<string, ScheduledTask>();
  private masterTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly agentManager: AgentManager) {}

  /**
   * Starts the global scheduler interval checker (polls every 10 seconds).
   */
  start(): void {
    if (this.masterTimer) return;
    this.masterTimer = setInterval(() => this.tick(), 10000);
  }

  /**
   * Stops the global scheduler and clears all tasks' local timers.
   */
  stop(): void {
    if (this.masterTimer) {
      clearInterval(this.masterTimer);
      this.masterTimer = undefined;
    }
    for (const task of this.tasks.values()) {
      if (task.intervalId) {
        clearInterval(task.intervalId);
      }
    }
  }

  /**
   * Registers a new recurring task with support for standard cron or natural language.
   */
  addTask(config: ScheduledTaskConfig): ScheduledTask {
    if (this.tasks.has(config.id)) {
      throw new Error(`Task already scheduled: ${config.id}`);
    }

    const intervalMs = this.parseNaturalLanguageToMs(config.expression);
    let intervalId: ReturnType<typeof setInterval> | undefined;

    if (intervalMs) {
      // For simple interval-based NL expressions (e.g. "every 10 seconds", "every 5 minutes")
      intervalId = setInterval(() => this.executeTask(config.id), intervalMs);
    }

    const nextRun = Date.now() + (intervalMs ?? 60000); // Rough estimation

    const scheduled: ScheduledTask = {
      config,
      runCount: 0,
      status: 'active',
      nextRun,
      intervalId,
    };

    this.tasks.set(config.id, scheduled);
    return scheduled;
  }

  /**
   * Removes a scheduled task.
   */
  removeTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.intervalId) {
      clearInterval(task.intervalId);
    }
    return this.tasks.delete(id);
  }

  /**
   * Gets a specific task.
   */
  getTask(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Lists all currently registered tasks.
   */
  listTasks(): ScheduledTask[] {
    return [...this.tasks.values()];
  }

  /**
   * Internal scheduler tick (polls cron-style hourly/daily checks).
   */
  private tick(): void {
    const now = new Date();
    for (const [id, task] of this.tasks.entries()) {
      if (task.status !== 'active') continue;
      if (task.intervalId) continue; // Already handled by interval timer

      // Rough cron checker for standard specs like "0 8 * * *" (daily at 8am)
      if (this.matchesCron(task.config.expression, now)) {
        this.executeTask(id);
      }
    }
  }

  /**
   * Fires the actual task via AgentManager.
   */
  private async executeTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'active') return;

    task.runCount++;
    task.lastRun = Date.now();
    
    // Check loop limit cap if set
    if (task.config.maxIterations && task.runCount >= task.config.maxIterations) {
      task.status = 'completed';
      if (task.intervalId) clearInterval(task.intervalId);
    }

    // Resolve which agent to assign
    const targetAgentId = task.config.agentId ?? this.agentManager.list()[0]?.id;
    if (targetAgentId) {
      await this.agentManager.assignTask(targetAgentId, task.config.taskDescription, task.config.groupId);
    }

    // Estimate next run timestamp
    const intervalMs = this.parseNaturalLanguageToMs(task.config.expression);
    task.nextRun = Date.now() + (intervalMs ?? 60000 * 60);
  }

  /**
   * Parses natural language instructions into milliseconds for setInterval fallback.
   */
  private parseNaturalLanguageToMs(expr: string): number | null {
    const clean = expr.toLowerCase().trim();
    
    // e.g. "every 10 seconds"
    let match = clean.match(/^every\s+(\d+)\s+seconds?$/);
    if (match && match[1]) return parseInt(match[1]) * 1000;

    // e.g. "every 5 minutes"
    match = clean.match(/^every\s+(\d+)\s+minutes?$/);
    if (match && match[1]) return parseInt(match[1]) * 60 * 1000;

    // e.g. "every 2 hours"
    match = clean.match(/^every\s+(\d+)\s+hours?$/);
    if (match && match[1]) return parseInt(match[1]) * 3600 * 1000;

    // Direct translations of keywords
    if (clean === 'hourly') return 3600 * 1000;
    if (clean === 'every minute') return 60 * 1000;
    if (clean === 'every second') return 1000;

    return null; // Fallback to cron parsing
  }

  /**
   * Helper that checks if a cron expression matches the current datetime.
   */
  private matchesCron(cronExpr: string, date: Date): boolean {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) {
      // Maybe check if it's natural language daily
      if (cronExpr.toLowerCase().startsWith('daily at ')) {
        const timeMatch = cronExpr.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch && timeMatch[1] && timeMatch[2]) {
          const hours = parseInt(timeMatch[1]);
          const mins = parseInt(timeMatch[2]);
          return date.getHours() === hours && date.getMinutes() === mins;
        }
      }
      return false;
    }

    const [minute, hour, dom, month, dow] = parts;

    const matchPart = (part: string | undefined, value: number): boolean => {
      if (!part) return false;
      if (part === '*') return true;
      if (part.includes(',')) return part.split(',').some(p => matchPart(p, value));
      if (part.includes('/')) {
        const [left, right] = part.split('/');
        const start = left === '*' ? 0 : parseInt(left || '0');
        const step = parseInt(right || '1');
        if (step <= 0) return false;
        return (value - start) % step === 0;
      }
      if (part.includes('-')) {
        const span = part.split('-');
        const start = parseInt(span[0] || '0');
        const end = parseInt(span[1] || '0');
        return value >= start && value <= end;
      }
      return parseInt(part) === value;
    };

    return (
      matchPart(minute, date.getMinutes()) &&
      matchPart(hour, date.getHours()) &&
      matchPart(dom, date.getDate()) &&
      matchPart(month, date.getMonth() + 1) &&
      matchPart(dow, date.getDay())
    );
  }
}
