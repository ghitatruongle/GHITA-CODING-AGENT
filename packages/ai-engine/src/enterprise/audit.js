// ==============================================================================
// GHITA CODING AGENT - Phase 3.9: Audit Logging
// Comprehensive audit trail for all requests and actions
// Reference: LiteLLM proxy/audit_logging
// ==============================================================================
import { randomBytes } from 'node:crypto';
// --- Severity hierarchy ---
const SEVERITY_ORDER = {
    info: 0,
    warning: 1,
    error: 2,
    critical: 3,
};
// --- Audit Logger ---
export class AuditLogger {
    events = [];
    config;
    requestIdCounter = 0;
    constructor(config) {
        this.config = {
            maxEvents: config?.maxEvents ?? 10000,
            enableConsoleLog: config?.enableConsoleLog ?? false,
            logFilePath: config?.logFilePath ?? '',
            eventTTLSeconds: config?.eventTTLSeconds ?? 0,
            minSeverity: config?.minSeverity ?? 'info',
        };
    }
    /** Log an audit event */
    log(event) {
        // Check severity threshold
        if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER[this.config.minSeverity]) {
            // Return a dummy event but don't store
            return {
                ...event,
                eventId: 'filtered',
                timestamp: new Date(),
            };
        }
        const fullEvent = {
            ...event,
            eventId: `evt_${randomBytes(8).toString('hex')}`,
            timestamp: new Date(),
        };
        this.events.push(fullEvent);
        // Trim to max events
        if (this.events.length > this.config.maxEvents) {
            this.events = this.events.slice(-this.config.maxEvents);
        }
        // Console log if enabled
        if (this.config.enableConsoleLog) {
            const logFn = fullEvent.severity === 'critical' || fullEvent.severity === 'error'
                ? console.error
                : fullEvent.severity === 'warning'
                    ? console.warn
                    : console.log;
            logFn(`[AUDIT] ${fullEvent.severity.toUpperCase()} ${fullEvent.action}`, JSON.stringify({
                eventId: fullEvent.eventId,
                userId: fullEvent.userId,
                outcome: fullEvent.outcome,
                resource: fullEvent.resource,
                errorMessage: fullEvent.errorMessage,
            }));
        }
        return fullEvent;
    }
    /** Log a chat request */
    logChatRequest(options) {
        return this.log({
            action: 'chat.request',
            severity: 'info',
            userId: options.userId,
            teamId: options.teamId,
            keyId: options.keyId,
            ip: options.ip,
            requestId: options.requestId,
            resource: `${options.provider}/${options.model}`,
            details: {
                model: options.model,
                provider: options.provider,
                messageCount: options.messageCount,
            },
            outcome: 'success',
        });
    }
    /** Log a chat response */
    logChatResponse(options) {
        return this.log({
            action: options.outcome === 'success' ? 'chat.response' : 'chat.error',
            severity: options.outcome === 'success' ? 'info' : 'error',
            userId: options.userId,
            requestId: options.requestId,
            resource: `${options.provider}/${options.model}`,
            durationMs: options.durationMs,
            details: {
                model: options.model,
                provider: options.provider,
                tokenUsage: options.tokenUsage,
            },
            outcome: options.outcome,
            errorMessage: options.errorMessage,
        });
    }
    /** Log authentication event */
    logAuth(options) {
        return this.log({
            action: options.action,
            severity: options.outcome === 'failure' ? 'warning' : 'info',
            userId: options.userId,
            keyId: options.keyId,
            ip: options.ip,
            details: { method: options.method },
            outcome: options.outcome,
            errorMessage: options.errorMessage,
        });
    }
    /** Log guardrail event */
    logGuardrail(options) {
        return this.log({
            action: options.action,
            severity: options.severity ?? (options.action === 'guardrail.blocked' ? 'warning' : 'info'),
            userId: options.userId,
            details: {
                guardrailType: options.guardrailType,
                reason: options.reason,
                contentPreview: options.content?.substring(0, 200),
            },
            outcome: options.action === 'guardrail.blocked' ? 'blocked' : 'success',
        });
    }
    /** Log admin action */
    logAdmin(options) {
        return this.log({
            action: options.action,
            severity: 'info',
            userId: options.userId,
            teamId: options.teamId,
            resource: options.resource,
            details: options.details,
            outcome: options.outcome ?? 'success',
            errorMessage: options.errorMessage,
        });
    }
    /** Query audit events */
    query(query) {
        let results = [...this.events];
        if (query.userId) {
            results = results.filter((e) => e.userId === query.userId);
        }
        if (query.teamId) {
            results = results.filter((e) => e.teamId === query.teamId);
        }
        if (query.action) {
            const actions = Array.isArray(query.action) ? query.action : [query.action];
            results = results.filter((e) => actions.includes(e.action));
        }
        if (query.severity) {
            results = results.filter((e) => e.severity === query.severity);
        }
        if (query.outcome) {
            results = results.filter((e) => e.outcome === query.outcome);
        }
        if (query.startTime) {
            results = results.filter((e) => e.timestamp >= query.startTime);
        }
        if (query.endTime) {
            results = results.filter((e) => e.timestamp <= query.endTime);
        }
        // Sort newest first
        results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        // Apply pagination
        const offset = query.offset ?? 0;
        const limit = query.limit ?? 100;
        return results.slice(offset, offset + limit);
    }
    /** Get statistics */
    getStats() {
        const eventsByAction = {};
        const eventsBySeverity = {};
        const eventsByOutcome = {};
        const recentErrors = [];
        for (const event of this.events) {
            eventsByAction[event.action] = (eventsByAction[event.action] ?? 0) + 1;
            eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] ?? 0) + 1;
            eventsByOutcome[event.outcome] = (eventsByOutcome[event.outcome] ?? 0) + 1;
            if (event.severity === 'error' || event.severity === 'critical') {
                recentErrors.push(event);
            }
        }
        return {
            totalEvents: this.events.length,
            eventsByAction,
            eventsBySeverity,
            eventsByOutcome,
            recentErrors: recentErrors.slice(-10),
        };
    }
    /** Generate a request ID */
    generateRequestId() {
        return `req_${Date.now().toString(36)}_${(++this.requestIdCounter).toString(36)}`;
    }
    /** Clean up old events based on TTL */
    cleanup() {
        if (this.config.eventTTLSeconds === 0)
            return 0;
        const cutoff = new Date(Date.now() - this.config.eventTTLSeconds * 1000);
        const before = this.events.length;
        this.events = this.events.filter((e) => e.timestamp > cutoff);
        return before - this.events.length;
    }
    /** Clear all events */
    clear() {
        this.events = [];
    }
    /** Export events as JSON */
    exportEvents(query) {
        const events = query ? this.query(query) : this.events;
        return JSON.stringify(events, null, 2);
    }
}
//# sourceMappingURL=audit.js.map