export interface ScheduledTaskConfig {
  id: string;
  expression: string; // "*/5 * * * *" or natural language "every 5 minutes", "daily at 8:00"
  taskDescription: string;
  agentId?: string;
  groupId?: string;
  maxIterations?: number; // Optional cap
}

export interface ScheduledTask {
  config: ScheduledTaskConfig;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  status: 'active' | 'paused' | 'completed';
  intervalId?: ReturnType<typeof setInterval>;
  /** Minute key of the last cron-triggered run — prevents multi-fire within one minute. */
  lastCronKey?: string;
}
