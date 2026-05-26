export type AuditAction = 'auth.login' | 'auth.logout' | 'auth.key_created' | 'auth.key_revoked' | 'chat.request' | 'chat.response' | 'chat.error' | 'model.call' | 'tool.execute' | 'admin.team_created' | 'admin.team_deleted' | 'admin.member_added' | 'admin.member_removed' | 'admin.settings_changed' | 'guardrail.blocked' | 'guardrail.flagged' | 'pii.detected' | 'secret.detected' | 'budget.exceeded' | 'rate_limit.hit' | 'custom';
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';
export interface AuditEvent {
    eventId: string;
    timestamp: Date;
    action: AuditAction;
    severity: AuditSeverity;
    userId?: string;
    teamId?: string;
    keyId?: string;
    ip?: string;
    userAgent?: string;
    resource?: string;
    details?: Record<string, unknown>;
    /** Request ID for correlation */
    requestId?: string;
    /** Duration in ms (for timed operations) */
    durationMs?: number;
    /** Outcome */
    outcome: 'success' | 'failure' | 'blocked';
    /** Error message if failed */
    errorMessage?: string;
}
export interface AuditQuery {
    userId?: string;
    teamId?: string;
    action?: AuditAction | AuditAction[];
    severity?: AuditSeverity;
    outcome?: 'success' | 'failure' | 'blocked';
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
}
export interface AuditConfig {
    /** Max events to keep in memory */
    maxEvents?: number;
    /** Enable console logging */
    enableConsoleLog?: boolean;
    /** Enable file logging (path) */
    logFilePath?: string;
    /** Event TTL in seconds (0 = keep forever) */
    eventTTLSeconds?: number;
    /** Minimum severity to log */
    minSeverity?: AuditSeverity;
}
export interface AuditStats {
    totalEvents: number;
    eventsByAction: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    eventsByOutcome: Record<string, number>;
    recentErrors: AuditEvent[];
}
export declare class AuditLogger {
    private events;
    private config;
    private requestIdCounter;
    constructor(config?: AuditConfig);
    /** Log an audit event */
    log(event: Omit<AuditEvent, 'eventId' | 'timestamp'>): AuditEvent;
    /** Log a chat request */
    logChatRequest(options: {
        userId?: string;
        teamId?: string;
        keyId?: string;
        model: string;
        provider: string;
        messageCount: number;
        requestId?: string;
        ip?: string;
    }): AuditEvent;
    /** Log a chat response */
    logChatResponse(options: {
        userId?: string;
        requestId?: string;
        model: string;
        provider: string;
        tokenUsage?: {
            prompt: number;
            completion: number;
            total: number;
        };
        durationMs?: number;
        outcome: 'success' | 'failure';
        errorMessage?: string;
    }): AuditEvent;
    /** Log authentication event */
    logAuth(options: {
        action: 'auth.login' | 'auth.logout' | 'auth.key_created' | 'auth.key_revoked';
        userId?: string;
        keyId?: string;
        method?: string;
        ip?: string;
        outcome: 'success' | 'failure';
        errorMessage?: string;
    }): AuditEvent;
    /** Log guardrail event */
    logGuardrail(options: {
        action: 'guardrail.blocked' | 'guardrail.flagged';
        userId?: string;
        guardrailType: string;
        reason: string;
        content?: string;
        severity?: AuditSeverity;
    }): AuditEvent;
    /** Log admin action */
    logAdmin(options: {
        action: AuditAction;
        userId: string;
        teamId?: string;
        resource?: string;
        details?: Record<string, unknown>;
        outcome?: 'success' | 'failure';
        errorMessage?: string;
    }): AuditEvent;
    /** Query audit events */
    query(query: AuditQuery): AuditEvent[];
    /** Get statistics */
    getStats(): AuditStats;
    /** Generate a request ID */
    generateRequestId(): string;
    /** Clean up old events based on TTL */
    cleanup(): number;
    /** Clear all events */
    clear(): void;
    /** Export events as JSON */
    exportEvents(query?: AuditQuery): string;
}
//# sourceMappingURL=audit.d.ts.map