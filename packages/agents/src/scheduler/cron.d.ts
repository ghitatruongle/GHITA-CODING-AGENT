import type { AgentManager } from '../index.js';
import type { ScheduledTask, ScheduledTaskConfig } from './types.js';
export declare class CronScheduler {
    private readonly agentManager;
    private readonly tasks;
    private masterTimer?;
    constructor(agentManager: AgentManager);
    /**
     * Starts the global scheduler interval checker (polls every 10 seconds).
     */
    start(): void;
    /**
     * Stops the global scheduler and clears all tasks' local timers.
     */
    stop(): void;
    /**
     * Registers a new recurring task with support for standard cron or natural language.
     */
    addTask(config: ScheduledTaskConfig): ScheduledTask;
    /**
     * Removes a scheduled task.
     */
    removeTask(id: string): boolean;
    /**
     * Gets a specific task.
     */
    getTask(id: string): ScheduledTask | undefined;
    /**
     * Lists all currently registered tasks.
     */
    listTasks(): ScheduledTask[];
    /**
     * Internal scheduler tick (polls cron-style hourly/daily checks).
     */
    private tick;
    /**
     * Fires the actual task via AgentManager.
     */
    private executeTask;
    /**
     * Parses natural language instructions into milliseconds for setInterval fallback.
     */
    private parseNaturalLanguageToMs;
    /**
     * Helper that checks if a cron expression matches the current datetime.
     */
    private matchesCron;
}
//# sourceMappingURL=cron.d.ts.map