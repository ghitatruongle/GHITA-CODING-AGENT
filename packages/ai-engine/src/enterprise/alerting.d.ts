export type AlertChannel = 'slack' | 'email' | 'pagerduty' | 'webhook' | 'console';
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertCategory = 'budget' | 'rate_limit' | 'error' | 'latency' | 'guardrail' | 'security' | 'availability' | 'custom';
export interface AlertRule {
    ruleId: string;
    name: string;
    description?: string;
    enabled: boolean;
    category: AlertCategory;
    severity: AlertSeverity;
    channels: AlertChannel[];
    /** Condition: function that evaluates to true when alert should fire */
    condition: (context: AlertContext) => boolean;
    /** Cooldown in seconds (don't re-fire within this period) */
    cooldownSeconds?: number;
    /** Last fired timestamp */
    lastFiredAt?: number;
}
export interface AlertContext {
    category: AlertCategory;
    metric?: string;
    value?: number;
    threshold?: number;
    userId?: string;
    teamId?: string;
    model?: string;
    provider?: string;
    message?: string;
    metadata?: Record<string, unknown>;
}
export interface Alert {
    alertId: string;
    ruleId: string;
    ruleName: string;
    severity: AlertSeverity;
    category: AlertCategory;
    message: string;
    context: AlertContext;
    timestamp: Date;
    channels: AlertChannel[];
    delivered: Record<AlertChannel, boolean>;
}
export interface SlackConfig {
    webhookUrl: string;
    channel?: string;
    username?: string;
    iconEmoji?: string;
}
export interface EmailConfig {
    provider: 'sendgrid' | 'smtp' | 'resend';
    apiKey?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    from: string;
    to: string[];
}
export interface PagerDutyConfig {
    routingKey: string;
    apiUrl?: string;
}
export interface WebhookConfig {
    url: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    secret?: string;
}
export interface AlertingConfig {
    slack?: SlackConfig;
    email?: EmailConfig;
    pagerduty?: PagerDutyConfig;
    webhook?: WebhookConfig;
    /** Enable console output */
    enableConsole?: boolean;
    /** Max alerts to keep in history */
    maxHistory?: number;
}
export declare class AlertingManager {
    private config;
    private rules;
    private history;
    private alertCount;
    constructor(config: AlertingConfig, rules?: AlertRule[]);
    /** Add or update a rule */
    addRule(rule: AlertRule): void;
    /** Remove a rule */
    removeRule(ruleId: string): boolean;
    /** Evaluate context against all rules and fire alerts */
    evaluate(context: AlertContext): Promise<Alert[]>;
    /** Fire a single alert */
    fireAlert(rule: AlertRule, context: AlertContext): Promise<Alert | null>;
    /** Deliver alert to a specific channel */
    private deliver;
    /** Get alert history */
    getHistory(options?: {
        severity?: AlertSeverity;
        category?: AlertCategory;
        limit?: number;
    }): Alert[];
    /** Get stats */
    getStats(): {
        totalAlerts: number;
        alertsBySeverity: Record<string, number>;
        alertsByCategory: Record<string, number>;
        deliveryRate: Record<AlertChannel, {
            sent: number;
            delivered: number;
        }>;
        activeRules: number;
    };
    /** Get all rules */
    getRules(): AlertRule[];
    /** Clear history */
    clearHistory(): void;
}
export declare function createBudgetAlertRule(threshold: number): AlertRule;
export declare function createErrorRateAlertRule(threshold: number): AlertRule;
export declare function createLatencyAlertRule(maxLatencyMs: number): AlertRule;
export declare function createSecurityAlertRule(): AlertRule;
//# sourceMappingURL=alerting.d.ts.map