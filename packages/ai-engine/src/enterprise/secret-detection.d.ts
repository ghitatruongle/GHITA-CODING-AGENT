export type SecretType = 'api_key' | 'access_token' | 'password' | 'private_key' | 'connection_string' | 'jwt' | 'oauth' | 'webhook' | 'database' | 'cloud_credentials' | 'service_account' | 'bot_token' | 'custom';
export type SecretProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'aws' | 'github' | 'gitlab' | 'slack' | 'discord' | 'stripe' | 'twilio' | 'sendgrid' | 'datadog' | 'newrelic' | 'heroku' | 'digitalocean' | 'supabase' | 'firebase' | 'mongodb' | 'redis' | 'postgres' | 'mysql' | 'jwt' | 'generic' | 'custom';
export interface SecretFinding {
    type: SecretType;
    provider: SecretProvider;
    value: string;
    start: number;
    end: number;
    confidence: number;
    description: string;
    /** Partially masked value for display */
    maskedValue: string;
}
export interface SecretDetectionResult {
    detected: boolean;
    findings: SecretFinding[];
    redactedContent?: string;
    summary: string;
}
export interface SecretPattern {
    type: SecretType;
    provider: SecretProvider;
    pattern: RegExp;
    confidence: number;
    description: string;
}
export declare class SecretDetector {
    private patterns;
    private allowlist;
    constructor(options?: {
        customPatterns?: SecretPattern[];
        allowlist?: string[];
    });
    /** Detect secrets in content */
    detect(content: string): SecretDetectionResult;
    /** Quick check if content contains secrets */
    hasSecrets(content: string): boolean;
    /** Add patterns to allowlist */
    addToAllowlist(values: string[]): void;
    /** Add custom pattern */
    addPattern(pattern: SecretPattern): void;
    /** Mask a secret value */
    private maskSecret;
    /** Remove overlapping findings */
    private deduplicateFindings;
    /** Apply redaction to content */
    private applyRedaction;
    /** Get all patterns */
    getPatterns(): SecretPattern[];
    /** Get pattern count by provider */
    getPatternCountByProvider(): Record<string, number>;
}
//# sourceMappingURL=secret-detection.d.ts.map