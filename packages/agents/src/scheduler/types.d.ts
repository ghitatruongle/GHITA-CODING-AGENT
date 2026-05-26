export interface ScheduledTaskConfig {
    id: string;
    expression: string;
    taskDescription: string;
    agentId?: string;
    groupId?: string;
    maxIterations?: number;
}
export interface ScheduledTask {
    config: ScheduledTaskConfig;
    lastRun?: number;
    nextRun?: number;
    runCount: number;
    status: 'active' | 'paused' | 'completed';
    intervalId?: any;
}
//# sourceMappingURL=types.d.ts.map