export type PIIType = 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address' | 'date_of_birth' | 'passport' | 'driver_license' | 'bank_account' | 'name' | 'address' | 'url' | 'api_key' | 'jwt_token' | 'custom';
export type PIIAction = 'redact' | 'mask' | 'hash' | 'flag' | 'block';
export interface PIIDetectionResult {
    detected: boolean;
    findings: PIIFinding[];
    redactedContent?: string;
    summary: string;
}
export interface PIIFinding {
    type: PIIType;
    value: string;
    start: number;
    end: number;
    confidence: number;
    action: PIIAction;
}
export interface PIIConfig {
    /** Types to detect */
    enabledTypes: PIIType[];
    /** Action to take when PII is found */
    defaultAction: PIIAction;
    /** Custom patterns for detection */
    customPatterns?: Array<{
        type: PIIType;
        pattern: RegExp;
        confidence: number;
    }>;
    /** Minimum confidence threshold */
    confidenceThreshold?: number;
    /** Preserve format (e.g., keep last 4 digits of credit card) */
    preserveFormat?: boolean;
}
export declare class PIIDetector {
    private config;
    private allPatterns;
    constructor(config?: Partial<PIIConfig>);
    /** Detect PII in content */
    detect(content: string): PIIDetectionResult;
    /** Quick check if content contains PII */
    hasPII(content: string): boolean;
    /** Remove overlapping findings, keep highest confidence */
    private deduplicateFindings;
    /** Apply redaction to content based on findings */
    private applyRedaction;
    /** Mask a value, preserving format */
    private maskValue;
    /** Simple hash for non-reversible redaction */
    private simpleHash;
    /** Get enabled PII types */
    getEnabledTypes(): PIIType[];
    /** Update config */
    updateConfig(updates: Partial<PIIConfig>): void;
}
//# sourceMappingURL=pii-detection.d.ts.map