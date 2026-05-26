// ==============================================================================
// GHITA CODING AGENT - Phase 3.11: Alerting System
// Slack, email (SendGrid/SMTP/Resend), PagerDuty alerts
// Reference: LiteLLM integrations/SlackAlerting/
// ==============================================================================
import { randomBytes } from 'node:crypto';
// --- Alert Delivery Functions ---
async function sendSlackAlert(alert, config) {
    try {
        const severityEmoji = {
            info: ':information_source:',
            warning: ':warning:',
            error: ':x:',
            critical: ':rotating_light:',
        };
        const payload = {
            channel: config.channel,
            username: config.username ?? 'GHITA Alerting',
            icon_emoji: config.iconEmoji ?? ':robot_face:',
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `${severityEmoji[alert.severity]} ${alert.ruleName}`,
                    },
                },
                {
                    type: 'section',
                    fields: [
                        { type: 'mrkdwn', text: `*Severity:*\n${alert.severity.toUpperCase()}` },
                        { type: 'mrkdwn', text: `*Category:*\n${alert.category}` },
                        { type: 'mrkdwn', text: `*Time:*\n${alert.timestamp.toISOString()}` },
                        ...(alert.context.model
                            ? [{ type: 'mrkdwn', text: `*Model:*\n${alert.context.model}` }]
                            : []),
                    ],
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: alert.message,
                    },
                },
            ],
        };
        const response = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
async function sendEmailAlert(alert, config) {
    try {
        if (config.provider === 'sendgrid' && config.apiKey) {
            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    personalizations: [{ to: config.to.map((email) => ({ email })) }],
                    from: { email: config.from },
                    subject: `[GHITA Alert] ${alert.severity.toUpperCase()}: ${alert.ruleName}`,
                    content: [
                        {
                            type: 'text/plain',
                            value: buildEmailBody(alert),
                        },
                    ],
                }),
            });
            return response.ok;
        }
        if (config.provider === 'resend' && config.apiKey) {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: config.from,
                    to: config.to,
                    subject: `[GHITA Alert] ${alert.severity.toUpperCase()}: ${alert.ruleName}`,
                    text: buildEmailBody(alert),
                }),
            });
            return response.ok;
        }
        // SMTP would require a library like nodemailer — log only for now
        console.log('[Alerting] SMTP email alert (requires nodemailer):', alert.ruleName);
        return false;
    }
    catch {
        return false;
    }
}
async function sendPagerDutyAlert(alert, config) {
    try {
        const severityMap = {
            info: 'info',
            warning: 'warning',
            error: 'error',
            critical: 'critical',
        };
        const payload = {
            routing_key: config.routingKey,
            event_action: 'trigger',
            dedup_key: alert.alertId,
            payload: {
                summary: `[${alert.severity.toUpperCase()}] ${alert.ruleName}: ${alert.message.substring(0, 200)}`,
                severity: severityMap[alert.severity],
                source: 'ghita-ai-engine',
                component: alert.category,
                custom_details: alert.context,
            },
        };
        const apiUrl = config.apiUrl ?? 'https://events.pagerduty.com/v2/enqueue';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
async function sendWebhookAlert(alert, config) {
    try {
        const payload = {
            alertId: alert.alertId,
            ruleName: alert.ruleName,
            severity: alert.severity,
            category: alert.category,
            message: alert.message,
            context: alert.context,
            timestamp: alert.timestamp.toISOString(),
        };
        const headers = {
            'Content-Type': 'application/json',
            ...config.headers,
        };
        // HMAC signing if secret provided
        if (config.secret) {
            const { createHash } = require('node:crypto');
            const body = JSON.stringify(payload);
            const signature = createHash('sha256')
                .update(body + config.secret)
                .digest('hex');
            headers['X-GHITA-Signature'] = signature;
        }
        const response = await fetch(config.url, {
            method: config.method ?? 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
function buildEmailBody(alert) {
    return `
GHITA AI Engine Alert
=====================
Rule: ${alert.ruleName}
Severity: ${alert.severity.toUpperCase()}
Category: ${alert.category}
Time: ${alert.timestamp.toISOString()}

Message:
${alert.message}

Context:
${JSON.stringify(alert.context, null, 2)}

Alert ID: ${alert.alertId}
`.trim();
}
// --- Alerting Manager ---
export class AlertingManager {
    config;
    rules = new Map();
    history = [];
    alertCount = 0;
    constructor(config, rules) {
        this.config = {
            enableConsole: config.enableConsole ?? true,
            maxHistory: config.maxHistory ?? 1000,
            ...config,
        };
        if (rules) {
            for (const rule of rules) {
                this.rules.set(rule.ruleId, rule);
            }
        }
    }
    /** Add or update a rule */
    addRule(rule) {
        this.rules.set(rule.ruleId, rule);
    }
    /** Remove a rule */
    removeRule(ruleId) {
        return this.rules.delete(ruleId);
    }
    /** Evaluate context against all rules and fire alerts */
    async evaluate(context) {
        const fired = [];
        const now = Date.now();
        for (const rule of this.rules.values()) {
            if (!rule.enabled)
                continue;
            // Check cooldown
            if (rule.cooldownSeconds &&
                rule.lastFiredAt &&
                now - rule.lastFiredAt < rule.cooldownSeconds * 1000) {
                continue;
            }
            // Evaluate condition
            try {
                if (rule.condition(context)) {
                    const alert = await this.fireAlert(rule, context);
                    if (alert)
                        fired.push(alert);
                }
            }
            catch (error) {
                console.error(`[Alerting] Rule "${rule.name}" evaluation failed:`, error);
            }
        }
        return fired;
    }
    /** Fire a single alert */
    async fireAlert(rule, context) {
        const alertId = `alert_${randomBytes(8).toString('hex')}`;
        const alert = {
            alertId,
            ruleId: rule.ruleId,
            ruleName: rule.name,
            severity: rule.severity,
            category: rule.category,
            message: context.message ?? `Alert triggered: ${rule.name}`,
            context,
            timestamp: new Date(),
            channels: rule.channels,
            delivered: {},
        };
        // Deliver to each channel
        for (const channel of rule.channels) {
            alert.delivered[channel] = await this.deliver(alert, channel);
        }
        // Update rule cooldown
        rule.lastFiredAt = Date.now();
        // Add to history
        this.history.push(alert);
        if (this.history.length > (this.config.maxHistory ?? 1000)) {
            this.history = this.history.slice(-(this.config.maxHistory ?? 1000));
        }
        this.alertCount++;
        return alert;
    }
    /** Deliver alert to a specific channel */
    async deliver(alert, channel) {
        try {
            switch (channel) {
                case 'slack':
                    if (this.config.slack) {
                        return await sendSlackAlert(alert, this.config.slack);
                    }
                    return false;
                case 'email':
                    if (this.config.email) {
                        return await sendEmailAlert(alert, this.config.email);
                    }
                    return false;
                case 'pagerduty':
                    if (this.config.pagerduty) {
                        return await sendPagerDutyAlert(alert, this.config.pagerduty);
                    }
                    return false;
                case 'webhook':
                    if (this.config.webhook) {
                        return await sendWebhookAlert(alert, this.config.webhook);
                    }
                    return false;
                case 'console':
                    if (this.config.enableConsole) {
                        const logFn = alert.severity === 'critical' || alert.severity === 'error'
                            ? console.error
                            : alert.severity === 'warning'
                                ? console.warn
                                : console.log;
                        logFn(`[ALERT] ${alert.severity.toUpperCase()} [${alert.category}] ${alert.ruleName}: ${alert.message}`);
                        return true;
                    }
                    return false;
                default:
                    return false;
            }
        }
        catch (error) {
            console.error(`[Alerting] Delivery to ${channel} failed:`, error);
            return false;
        }
    }
    /** Get alert history */
    getHistory(options) {
        let alerts = [...this.history];
        if (options?.severity) {
            alerts = alerts.filter((a) => a.severity === options.severity);
        }
        if (options?.category) {
            alerts = alerts.filter((a) => a.category === options.category);
        }
        alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return alerts.slice(0, options?.limit ?? 100);
    }
    /** Get stats */
    getStats() {
        const alertsBySeverity = {};
        const alertsByCategory = {};
        const deliveryByChannel = {};
        for (const alert of this.history) {
            alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] ?? 0) + 1;
            alertsByCategory[alert.category] = (alertsByCategory[alert.category] ?? 0) + 1;
            for (const channel of alert.channels) {
                if (!deliveryByChannel[channel]) {
                    deliveryByChannel[channel] = { sent: 0, delivered: 0 };
                }
                deliveryByChannel[channel].sent++;
                if (alert.delivered[channel]) {
                    deliveryByChannel[channel].delivered++;
                }
            }
        }
        return {
            totalAlerts: this.alertCount,
            alertsBySeverity,
            alertsByCategory,
            deliveryRate: deliveryByChannel,
            activeRules: [...this.rules.values()].filter((r) => r.enabled).length,
        };
    }
    /** Get all rules */
    getRules() {
        return [...this.rules.values()];
    }
    /** Clear history */
    clearHistory() {
        this.history = [];
    }
}
// --- Pre-built Alert Rules ---
export function createBudgetAlertRule(threshold) {
    return {
        ruleId: 'budget_exceeded',
        name: 'Budget Exceeded',
        description: 'Fire when spending exceeds the configured threshold',
        enabled: true,
        category: 'budget',
        severity: 'warning',
        channels: ['console', 'slack'],
        cooldownSeconds: 3600,
        condition: (ctx) => {
            return ctx.category === 'budget' && (ctx.value ?? 0) > threshold;
        },
    };
}
export function createErrorRateAlertRule(threshold) {
    return {
        ruleId: 'high_error_rate',
        name: 'High Error Rate',
        description: 'Fire when error rate exceeds threshold',
        enabled: true,
        category: 'error',
        severity: 'error',
        channels: ['console', 'slack', 'email'],
        cooldownSeconds: 300,
        condition: (ctx) => {
            return ctx.category === 'error' && (ctx.value ?? 0) > threshold;
        },
    };
}
export function createLatencyAlertRule(maxLatencyMs) {
    return {
        ruleId: 'high_latency',
        name: 'High Latency',
        description: 'Fire when response latency exceeds threshold',
        enabled: true,
        category: 'latency',
        severity: 'warning',
        channels: ['console'],
        cooldownSeconds: 60,
        condition: (ctx) => {
            return ctx.category === 'latency' && (ctx.value ?? 0) > maxLatencyMs;
        },
    };
}
export function createSecurityAlertRule() {
    return {
        ruleId: 'security_incident',
        name: 'Security Incident',
        description: 'Fire on security-related events',
        enabled: true,
        category: 'security',
        severity: 'critical',
        channels: ['console', 'slack', 'email', 'pagerduty'],
        cooldownSeconds: 60,
        condition: (ctx) => {
            return ctx.category === 'security';
        },
    };
}
//# sourceMappingURL=alerting.js.map